// Festival schedule class.
//
// This contains a list of stages and a schedule, where the schedule is a list
// of days, each with a list of events for each stage.
class Schedule {
  #config;
  #stages;
  #schedule;
  #scheduleRanges;

  constructor(config, stages, schedule) {
    this.#config = config;
    this.#stages = stages;
    this.#schedule = schedule;
    // Precompute the start and end times for each stage on each day.
    this.#scheduleRanges = this.#computeScheduleRanges();
  }

  getConfig() {
    return this.#config;
  }

  getDayIds() {
    return this.#schedule.map((day) => day.id);
  }

  getStageIds(dayId) {
    if (dayId === undefined) {
      return this.#stages.map((stage) => stage.id);
    } else {
      return Object.keys(this.#schedule.find((day) => day.id === dayId).events);
    }
  }

  hasStage(dayId, stageId) {
    return this.getStageIds(dayId).includes(stageId);
  }

  getDays() {
    return this.#schedule;
  }

  getStages(dayId) {
    if (dayId === undefined) {
      return this.#stages;
    } else {
      const stageIds = this.getStageIds(dayId);
      return this.#stages.filter((stage) => stageIds.includes(stage.id));
    }
  }

  getDay(dayId) {
    return this.#schedule.find((day) => day.id === dayId);
  }

  getStage(stageId) {
    return this.#stages.find((stage) => stage.id === stageId);
  }

  getEvents(dayId, stageId) {
    return this.#schedule.find((day) => day.id === dayId).events[stageId];
  }

  getEventRange(dayId, event) {
    const date = this.getDay(dayId).date;
    const start = this.#convertToJSDate(date, event.start);
    const end = this.#convertToJSDate(date, event.end);
    return [start, end];
  }

  getRangeForStage(dayId, stageId) {
    return this.#scheduleRanges.get(dayId).get(stageId);
  }

  getRange(dayId, stageIds) {
    const availableStageIds = stageIds.filter((stageId) => {
      return this.hasStage(dayId, stageId);
    });
    const ranges = availableStageIds.map((stageId) =>
      this.getRangeForStage(dayId, stageId),
    );
    const start = new Date(Math.min(...ranges.map((range) => range[0])));
    const end = new Date(Math.max(...ranges.map((range) => range[1])));
    return [start, end];
  }

  // Gets the day ID for a date/time in the schedule.
  //
  // This only returns the day ID if the date/time is in the schedule for the
  // specified stages. It returns the first matching dayId if schedules overlap.
  getDayIdForDateTime(dateTime, stageIds) {
    for (const dayId of this.getDayIds()) {
      const [start, end] = this.getRange(dayId, stageIds);
      if (dateTime >= start && dateTime <= end) return dayId;
    }
    // Return undefined if the date/time is not in any of the schedules.
  }

  // Gets the reference time for the schedule.
  //
  // This is the time relative to which other times to display the schedule are
  // computed. It is defined as midnight at the start of the specified day.
  //
  // It is returned as a Date object.
  getReferenceTime(dayId) {
    return Schedule.#parseDate(this.getDay(dayId).date);
  }

  // Creates a schedule from a JSON URL.
  static async fetch(url) {
    const response = await fetch(url);
    const data = await response.json();
    const config = data.config;
    const stages = data.stages;
    const schedule = data.schedule;
    return new Schedule(config, stages, schedule);
  }

  // Computes the start and end times for each stage on each day.
  #computeScheduleRanges() {
    const ranges = new Map();
    for (const day of this.getDays()) {
      ranges.set(day.id, new Map());
      const stageRanges = ranges.get(day.id);
      for (const stageId of this.getStageIds(day.id)) {
        const events = this.getEvents(day.id, stageId);
        const starts = events.map((event) =>
          this.#convertToJSDate(day.date, event.start),
        );
        const ends = events.map((event) =>
          this.#convertToJSDate(day.date, event.end),
        );
        const start = new Date(Math.min(...starts));
        const end = new Date(Math.max(...ends));
        stageRanges.set(stageId, [start, end]);
      }
    }
    return ranges;
  }

  #convertToJSDate(date, time) {
    const reference = Schedule.#parseDate(date);

    let [hours, minutes] = time.split(":").map((x) => parseInt(x));
    // Schedules run into the night, so make sure that the day is increased if
    // the event is after midnight.
    if (hours < 6) {
      hours += 24;
    }
    // Compute the number of milliseconds since the reference time.
    const milliseconds = hours * 60 * 60 * 1000 + minutes * 60 * 1000;

    // Create a new date from the reference time and the offset.
    return new Date(reference.getTime() + milliseconds);
  }

  // Parses a date string in the format "YYYY-MM-DD" and returns a Date object.
  static #parseDate(date) {
    // This assumes that the date is in the current time zone, which should be OK.
    const parsed = new Date(date);
    // Set the time to 00:00:00.000.
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }
}

// Stage schedule class.
//
// This class represents a block schedule for a single stage on a single day as
// an SVG element.
class StageSchedule {
  #svg;
  #currentTimeLine;
  #blockHeight;
  #rangeInCoords;

  constructor(svg, currentTimeLine, blockHeight, rangeInCoords) {
    this.#svg = svg;
    this.#currentTimeLine = currentTimeLine;
    this.#blockHeight = blockHeight;
    this.#rangeInCoords = rangeInCoords;

    // Set the current time line to the current time.
    this.updateCurrentTimeLine();
  }

  get svg() {
    return this.#svg;
  }

  get rangeInCoords() {
    return this.#rangeInCoords;
  }

  // Clips the SVG to a specific range of coordinates.
  //
  // This also sets the width and height of the SVG appropriately.
  clip(startCoords, endCoords) {
    const width = endCoords - startCoords;

    this.#svg.setAttribute(
      "viewBox",
      `${startCoords} 0 ${width} ${this.#blockHeight.coords}`,
    );
    this.#svg.setAttribute("height", this.#blockHeight.pixels);
    this.#svg.setAttribute(
      "width",
      (width / this.#blockHeight.coords) * this.#blockHeight.pixels,
    );
  }

  // Updates the current time line to the current time.
  updateCurrentTimeLine() {
    const now = new Date();
    const xNow = StageSchedule.toSvgCoordinates(
      this.#currentTimeLine.referenceTime,
      now,
    );

    // If the current time is before the start of this day's schedule or after
    // its end, the line will be out of bounds, and therefore clipped off.
    const element = this.#currentTimeLine.element;
    element.setAttribute("x1", xNow);
    element.setAttribute("x2", xNow);
  }

  getCurrentTimeLineElement() {
    return this.#currentTimeLine.element;
  }

  static fromSchedule(schedule, dayId, stageId) {
    const builder = new StageScheduleBuilder(schedule, dayId, stageId);
    return builder.buildStageSchedule();
  }

  // Converts a date/time to SVG coordinates.
  //
  // The reference time is the start of the day, and the SVG coordinates are in
  // minutes from that time.
  static toSvgCoordinates(reference, dateTime) {
    return (dateTime - reference) / (1000 * 60);
  }

  // Gets the start coordinate, end coordinate and step size for an hour in a
  // stage schedule.
  static getHourCoordinates() {
    return {
      start: 0,
      end: 48 * 60,
      step: 60,
    };
  }
}

// Stage schedule builder.
//
// This class is used to build a stage schedule from a schedule object.
class StageScheduleBuilder {
  #dayId;
  #stageId;
  #schedule;
  #stageColour;
  #referenceTime;

  constructor(schedule, dayId, stageId) {
    this.#dayId = dayId;
    this.#stageId = stageId;
    this.#schedule = schedule;
    this.#stageColour = schedule.getStage(stageId).colour;
    this.#referenceTime = schedule.getReferenceTime(dayId);
  }

  // Creates a block schedule from a schedule object for a specific day and
  // stage.
  buildStageSchedule() {
    // Create a root SVG element for this stage's block schedule.
    const svg = StageScheduleBuilder.#createSvgElement("svg");

    // Create groups for hour lines, blocks, the current time line and text.
    const gHourLines = this.#createHourLines();
    const [gCurrentTime, currentTimeLine] = this.#createCurrentTimeLine();
    const [gBlocks, gText] = this.#createBlocks();

    // Append the groups in a specific order to ensure they are layered
    // appropriately (from bottom to top).
    svg.appendChild(gHourLines);
    svg.appendChild(gBlocks);
    svg.appendChild(gCurrentTime);
    svg.appendChild(gText);

    const range = this.#schedule.getRangeForStage(this.#dayId, this.#stageId);
    const rangeInCoords = range.map((time) =>
      StageSchedule.toSvgCoordinates(this.#referenceTime, time),
    );

    return new StageSchedule(
      svg,
      currentTimeLine,
      { ...this.#schedule.getConfig().blockHeight },
      rangeInCoords,
    );
  }

  // Creates a vertical line for each hour, just create all the lines we may
  // possibly show: from 00:00 until 00:00 the next day.
  #createHourLines() {
    const config = this.#schedule.getConfig();
    const gHourLines = StageScheduleBuilder.#createSvgElement("g");

    const hours = StageSchedule.getHourCoordinates();
    for (let x = hours.start; x < hours.end; x += hours.step) {
      const line = StageScheduleBuilder.#createSvgElement("line", {
        x1: x,
        y1: 0,
        x2: x,
        y2: config.blockHeight.coords,
        stroke: config.hourLine.stroke,
        "stroke-width": config.hourLine.strokeWidth,
      });
      gHourLines.appendChild(line);
    }
    return gHourLines;
  }

  // Creates a vertical line for the current time, initialise it at 0, it
  // will be updated in the constructor of the StageSchedule.
  #createCurrentTimeLine() {
    const config = this.#schedule.getConfig();

    const gCurrentTime = StageScheduleBuilder.#createSvgElement("g");
    const currentTimeLineElement = StageScheduleBuilder.#createSvgElement(
      "line",
      {
        x1: 0,
        y1: 0,
        x2: 0,
        y2: config.blockHeight.coords,
        stroke: config.currentTimeLine.stroke,
        "stroke-width": config.currentTimeLine.strokeWidth,
      },
    );
    gCurrentTime.appendChild(currentTimeLineElement);

    // Store the line element in an object, along with the reference time of
    // this day.
    const currentTimeLine = {
      referenceTime: this.#referenceTime,
      element: currentTimeLineElement,
    };

    return [gCurrentTime, currentTimeLine];
  }

  // Creates blocks for each event.
  //
  // Note: any events after midnight (i.e. 00:00 the next day), are considered
  // to be part of this day. Blocks and their associated text are created in
  // separate groups, since they need to be layered differently with respect to
  // the hour and current time lines.
  #createBlocks() {
    const gBlocks = StageScheduleBuilder.#createSvgElement("g");
    const gText = StageScheduleBuilder.#createSvgElement("g");

    const events = this.#schedule.getEvents(this.#dayId, this.#stageId);
    for (const event of events) {
      const [start, end] = this.#schedule.getEventRange(this.#dayId, event);
      const xStart = StageSchedule.toSvgCoordinates(this.#referenceTime, start);
      const xEnd = StageSchedule.toSvgCoordinates(this.#referenceTime, end);
      const width = xEnd - xStart;

      const block = this.#createBlock(xStart, width, event);
      const blockText = this.#createBlockText(xStart, width, event);

      gBlocks.appendChild(block);
      gText.appendChild(blockText);
    }
    return [gBlocks, gText];
  }

  // Creates a single block for an event.
  #createBlock(xStart, width, event) {
    const config = this.#schedule.getConfig();
    const rect = StageScheduleBuilder.#createSvgElement("rect", {
      x: xStart,
      y: 0,
      width: width,
      height: config.blockHeight.coords,
      fill: this.#stageColour,
      stroke: config.block.stroke,
      "stroke-width": config.block.strokeWidth,
    });
    rect.classList.add("block");
    if (event.url) {
      // If the event has a URL, add a click event to open the URL in a new
      // tab. The block will also be highlighted on hover.
      rect.classList.add("clickable");
      rect.addEventListener("click", () => window.open(event.url, "_blank"));
    }
    return rect;
  }

  // Creates a foreign object with a div to contain the artist name and stage
  // times. This ensure that we can more easily have nicely wrapping text, and
  // smaller time text under the artist name.
  #createBlockText(xStart, width, event) {
    const config = this.#schedule.getConfig();
    const foreignObject = StageScheduleBuilder.#createSvgElement(
      "foreignObject",
      {
        x: xStart,
        y: 0,
        width: width,
        height: config.blockHeight.coords,
      },
    );
    foreignObject.classList.add("block-text");
    // Create wrapping flexbox div to layout the artist name and time.
    const textContainerDiv = StageScheduleBuilder.#createXhtmlElement("div");
    textContainerDiv.classList.add("text-container");

    // Add the artist name and time to this div.
    const nameDiv = StageScheduleBuilder.#createXhtmlElement("div");
    nameDiv.classList.add("artist-name");
    nameDiv.textContent = event.name;
    const timeDiv = StageScheduleBuilder.#createXhtmlElement("div");
    timeDiv.classList.add("time");
    timeDiv.textContent = `${event.start} – ${event.end}`;

    textContainerDiv.appendChild(nameDiv);
    textContainerDiv.appendChild(timeDiv);
    foreignObject.appendChild(textContainerDiv);

    return foreignObject;
  }

  // Creates an element in a namespace with attributes.
  static #createElement(tag, ns, attributes) {
    const el = document.createElementNS(ns, tag);
    if (attributes) {
      for (const [key, value] of Object.entries(attributes)) {
        el.setAttribute(key, value);
      }
    }
    return el;
  }

  // Creates an SVG element with attributes.
  static #createSvgElement(tag, attributes) {
    return StageScheduleBuilder.#createElement(
      tag,
      "http://www.w3.org/2000/svg",
      attributes,
    );
  }

  // Creates an XHTML element with attributes.
  static #createXhtmlElement(tag, attributes) {
    return StageScheduleBuilder.#createElement(
      tag,
      "http://www.w3.org/1999/xhtml",
      attributes,
    );
  }
}

// Block schedule class.
//
// This class represents a block schedule for a single day, for a certain
// selection of stages.
class BlockSchedule {
  #container;
  #stageSchedules;

  constructor(container, schedule, dayId, enabledStageIds) {
    this.#container = container;
    this.#stageSchedules = this.#generateStageSchedules(schedule);
    this.updateBlockSchedule(dayId, enabledStageIds);
  }

  updateBlockSchedule(dayId, enabledStageIds) {
    // Clip the block schedule to the start and end of the current selection of
    // day and stages.
    const [startCoord, endCoord] = this.#computeCurrentRangeInCoords(
      dayId,
      enabledStageIds,
    );

    this.#clearContainer();
    const stageSchedules = this.#stageSchedules.get(dayId);
    for (const [stageId, stageSchedule] of stageSchedules) {
      const isEnabled = enabledStageIds.includes(stageId);
      if (!isEnabled) continue;

      stageSchedule.clip(startCoord, endCoord);
      this.#container.appendChild(stageSchedule.svg);
    }
  }

  updateCurrentTimeLines(dayId, enabledStageIds) {
    // Only update the current time line for the stages that are currently
    // being displayed.
    const stageSchedules = this.#stageSchedules.get(dayId);
    for (const [stageId, stageSchedule] of stageSchedules) {
      const isEnabled = enabledStageIds.includes(stageId);
      if (!isEnabled) continue;

      stageSchedule.updateCurrentTimeLine();
    }
  }

  // Returns the topmost current time line element for this schedule.
  //
  // This can be used to scroll to the current time.
  getCurrentTimeLineElement(dayId, enabledStageIds) {
    const stageSchedules = this.#stageSchedules.get(dayId);
    for (const [stageId, stageSchedule] of stageSchedules) {
      const isEnabled = enabledStageIds.includes(stageId);
      if (!isEnabled) continue;

      return stageSchedule.getCurrentTimeLineElement();
    }
  }

  #generateStageSchedules(schedule) {
    const stageSchedules = new Map();
    for (const dayId of schedule.getDayIds()) {
      stageSchedules.set(dayId, new Map());
      for (const stageId of schedule.getStageIds(dayId)) {
        stageSchedules
          .get(dayId)
          .set(stageId, StageSchedule.fromSchedule(schedule, dayId, stageId));
      }
    }
    return stageSchedules;
  }

  #computeCurrentRangeInCoords(dayId, enabledStageIds) {
    const stageSchedules = this.#stageSchedules.get(dayId);

    let start = Number.MAX_VALUE;
    let end = Number.MIN_VALUE;
    for (const stageId of enabledStageIds) {
      const hasStageSchedule = stageSchedules.has(stageId);
      if (!hasStageSchedule) continue;

      const [startCur, endCur] = this.#stageSchedules
        .get(dayId)
        .get(stageId).rangeInCoords;
      if (startCur < start) start = startCur;
      if (endCur > end) end = endCur;
    }
    return [start, end];
  }

  // Clears all children from an element.
  #clearContainer() {
    const container = this.#container;
    while (container.children.length > 0) {
      container.removeChild(container.lastChild);
    }
  }
}

// Class representing the application.
//
// This class manages the state of the application, including the selected day
// and stages.
class App {
  #daysContainer;
  #stagesContainer;
  #eventsContainer;
  #dayElements;
  #stageElements;
  #nowButton;

  #schedule;

  #blockSchedule;

  #dayId;
  #enabledStageIds;
  #scrollPosition;
  #dayIdCurrentTime;

  constructor(daysContainer, stagesContainer, eventsContainer, schedule) {
    this.#daysContainer = daysContainer;
    this.#stagesContainer = stagesContainer;
    this.#eventsContainer = eventsContainer;

    this.#schedule = schedule;

    // Start with the first day and all stages enabled.
    this.#dayId = schedule.getDayIds()[0];
    this.#enabledStageIds = schedule.getStageIds();
    this.#scrollPosition = null;

    // If present, load the state from local storage.
    this.#loadState();

    this.#dayElements = new Map();
    this.#stageElements = new Map();

    this.#populateDays();
    this.#populateStages();
    this.#blockSchedule = new BlockSchedule(
      this.#eventsContainer,
      schedule,
      this.#dayId,
      this.#enabledStageIds,
    );
    // Restore the scroll position if it was set in the saved state.
    this.#restoreScrollPosition();

    // Call the setDayId method to update the entire UI to the set day.
    this.#setDayId(this.#dayId);

    // Save the scroll position when the user finishes scrolling, so it can be
    // restored the next time the page is opened.
    eventsContainer.addEventListener("scrollend", () => {
      this.#saveScrollPosition();
    });

    // The page may in some (low resolution/small window) situations also be
    // scrolled vertically. In these situations it is more intuitive that the
    // mouse wheel scrolls vertically. However, when the page cannot be scrolled
    // vertically, the mouse wheel should scroll each container horizontally.
    const wheelCallback = (container, event) => {
      const root = document.documentElement;
      const canScrollVertically = root.scrollHeight > root.clientHeight;
      if (canScrollVertically) return;

      event.preventDefault();
      container.scrollLeft += event.deltaY;
    };
    this.#daysContainer.addEventListener("wheel", (event) =>
      wheelCallback(this.#daysContainer, event),
    );
    this.#stagesContainer.addEventListener("wheel", (event) =>
      wheelCallback(this.#stagesContainer, event),
    );
    this.#eventsContainer.addEventListener("wheel", (event) =>
      wheelCallback(this.#eventsContainer, event),
    );

    // Clicking the "now" button should scroll to the current time.
    this.#nowButton = document.querySelector("#button-now");
    this.#nowButton.addEventListener("click", () => {
      // If the current time is not in the schedule, do nothing (the button
      // should be disabled anyway)...
      if (!this.#dayIdCurrentTime) return;

      // Set the current day and scroll to the current time line.
      this.#setDayId(this.#dayIdCurrentTime);
      const currentTimeLineElement =
        this.#blockSchedule.getCurrentTimeLineElement(
          this.#dayId,
          this.#enabledStageIds,
        );
      currentTimeLineElement.scrollIntoView({
        behavior: "smooth",
        inline: "center",
      });
    });

    // Add a timer to update the current time lines every 30 seconds.
    window.setInterval(() => this.#updateForCurrentTime(), 30 * 1000);
    // Also run the callback once to update for the current time immediately.
    this.#updateForCurrentTime();

    // Since timers do not continue to run when the window is out of focus, also
    // update the current time lines when the window is focused.
    window.addEventListener("focus", () => {
      this.#updateForCurrentTime();
    });
  }

  // Saves the day and enabled stages to local storage.
  #saveState() {
    localStorage.setItem("dayId", this.#dayId);
    localStorage.setItem(
      "enabledStageIds",
      JSON.stringify(this.#enabledStageIds),
    );
    localStorage.setItem("scrollPosition", this.#scrollPosition);
  }

  // If present, loads the day and enabled stages from local storage.
  #loadState() {
    const dayId = localStorage.getItem("dayId");
    if (dayId) this.#dayId = dayId;
    const enabledStageIds = localStorage.getItem("enabledStageIds");
    if (enabledStageIds) this.#enabledStageIds = JSON.parse(enabledStageIds);
    const scrollPosition = localStorage.getItem("scrollPosition");
    if (scrollPosition) this.#scrollPosition = scrollPosition;
  }

  // Populates the days container with days.
  //
  // This only has to be called once, so we do not empty the container.
  #populateDays() {
    for (const day of this.#schedule.getDays()) {
      const dayElement = document.createElement("div");
      dayElement.classList.add("day");

      const isSelected = day.id === this.#dayId;
      dayElement.classList.add(isSelected ? "active" : "inactive");
      dayElement.textContent = day.name;

      dayElement.addEventListener("click", () => this.#setDayId(day.id));

      this.#dayElements.set(day.id, dayElement);
      this.#daysContainer.appendChild(dayElement);
    }
  }

  // Populates the stages container with stages.
  //
  // We add all stages to the DOM, and show or hide them depending on the
  // enabled stages.
  #populateStages() {
    for (const stage of this.#schedule.getStages()) {
      const stageElement = document.createElement("div");
      stageElement.classList.add("stage");

      stageElement.style.backgroundColor = stage.colour;

      stageElement.addEventListener("click", () =>
        this.#toggleStageId(stage.id),
      );

      const stageTextElement = document.createElement("div");
      stageTextElement.textContent = stage.name;

      stageElement.appendChild(stageTextElement);

      this.#stageElements.set(stage.id, stageElement);
      this.#stagesContainer.appendChild(stageElement);
    }
  }

  #restoreScrollPosition() {
    if (this.#scrollPosition !== null) {
      this.#eventsContainer.scrollLeft = this.#scrollPosition;
    }
  }

  #updateStages() {
    for (const stage of this.#schedule.getStages()) {
      const stageElement = this.#stageElements.get(stage.id);

      // Check whether the stage is available for this day and add the
      // appropriate class if it is not.
      if (!this.#schedule.hasStage(this.#dayId, stage.id)) {
        stageElement.classList.add("unavailable");
        continue;
      } else {
        stageElement.classList.remove("unavailable");
      }
      // Check whether the stage is enabled and add the appropriate class.
      const isSelected = this.#enabledStageIds.includes(stage.id);
      stageElement.classList.add(isSelected ? "active" : "inactive");
    }
  }

  #updateForCurrentTime() {
    this.#updateCurrentTimeLines();
    // Check whether the "now" button should be shown. It should only be visible
    // when the current time is within any day of the schedule. In this case,
    // a dayId will be returned from the getDayIdForDateTime method.
    const now = new Date();
    this.#dayIdCurrentTime = this.#schedule.getDayIdForDateTime(
      now,
      this.#enabledStageIds,
    );
    if (this.#dayIdCurrentTime) {
      this.#nowButton.classList.remove("unavailable");
    } else {
      this.#nowButton.classList.add("unavailable");
    }
  }

  #updateCurrentTimeLines() {
    this.#blockSchedule.updateCurrentTimeLines(
      this.#dayId,
      this.#enabledStageIds,
    );
  }

  #setDayId(dayId) {
    this.#dayId = dayId;

    // Change the active day.
    for (const [id, element] of this.#dayElements) {
      element.classList.remove("active", "inactive");
      element.classList.add(id === dayId ? "active" : "inactive");
    }

    // Update the stages and the block schedule.
    this.#updateStages();
    this.#blockSchedule.updateBlockSchedule(this.#dayId, this.#enabledStageIds);
    this.#updateCurrentTimeLines();

    this.#saveState();
  }

  #toggleStageId(stageId) {
    const stageElement = this.#stageElements.get(stageId);

    const willBeEnabled = !this.#enabledStageIds.includes(stageId);
    if (willBeEnabled) {
      this.#enabledStageIds.push(stageId);
      stageElement.classList.remove("inactive");
      stageElement.classList.add("active");
    } else {
      this.#enabledStageIds = this.#enabledStageIds.filter(
        (id) => id !== stageId,
      );
      stageElement.classList.remove("active");
      stageElement.classList.add("inactive");
    }

    // Update the block schedule.
    this.#blockSchedule.updateBlockSchedule(this.#dayId, this.#enabledStageIds);

    this.#saveState();
  }

  #saveScrollPosition() {
    this.#scrollPosition = this.#eventsContainer.scrollLeft;
    this.#saveState();
  }
}

async function main() {
  const schedule = await Schedule.fetch("schedule.json");

  const daysContainer = document.querySelector("#days");
  const stagesContainer = document.querySelector("#stages");
  const eventsContainer = document.querySelector("#events");

  const app = new App(
    daysContainer,
    stagesContainer,
    eventsContainer,
    schedule,
  );
}

// Run the main function.
main();
