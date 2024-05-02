// Helper functions

// Creates an element in a namespace with attributes.
function createElement(tag, ns, attributes) {
  const el = document.createElementNS(ns, tag);
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      el.setAttribute(key, value);
    }
  }
  return el;
}

// Creates an SVG element with attributes.
function createSvgElement(tag, attributes) {
  return createElement(tag, "http://www.w3.org/2000/svg", attributes);
}

// Creates an XHTML element with attributes.
function createXhtmlElement(tag, attributes) {
  return createElement(tag, "http://www.w3.org/1999/xhtml", attributes);
}

// Clears all children from an element.
function clearContainer(container) {
  while (container.children.length > 0) {
    container.removeChild(container.lastChild);
  }
}

// Parses a time string in the format "HH:MM" and returns the number of minutes.
function computeNumMinutes(time) {
  let [hours, minutes] = time.split(":").map((x) => parseInt(x));
  if (hours < 6) {
    hours += 24;
  }
  return hours * 60 + minutes;
}

// Parses a date string in the format "YYYY-MM-DD" and returns a Date object.
function parseDate(date) {
  // This assumes that the date is in the current time zone, which should be OK.
  const parsed = new Date(date);
  // Set the time to 00:00:00.000.
  parsed.setHours(0, 0, 0, 0);
  return parsed;
}

// Festival schedule class.
//
// This contains a list of stages and a schedule, where the schedule is a list
// of days, each with a list of events for each stage.
class Schedule {
  #stages;
  #schedule;

  constructor(stages, schedule) {
    this.#stages = stages;
    this.#schedule = schedule;
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

  // Gets the start and end of the schedule at the specified day and stage.
  //
  // The range is returned as the start and end in minutes from 00:00 of the
  // start of the specified day.
  getRangeInMinutes(dayId, stageId) {
    const events = this.getEvents(dayId, stageId);
    const startMinutes = Math.min(
      ...events.map((event) => computeNumMinutes(event.start)),
    );
    const endMinutes = Math.max(
      ...events.map((event) => computeNumMinutes(event.end)),
    );
    return [startMinutes, endMinutes];
  }

  // Gets the reference time for the schedule.
  //
  // This is the time relative to which other times to display the schedule are
  // computed. It is defined as midnight at the start of the specified day.
  //
  // It is returned as a Date object.
  getReferenceTime(dayId) {
    return parseDate(this.getDay(dayId).date);
  }

  static async fetch(url) {
    const response = await fetch(url);
    const data = await response.json();
    const stages = data.stages;
    const schedule = data.schedule;
    return new Schedule(stages, schedule);
  }
}

// Stage schedule class.
//
// This class represents a block schedule for a single stage on a single day as
// an SVG element.
class StageSchedule {
  // The height of each block in "minutes", to determine the aspect ratio of the
  // blocks.
  static #BLOCK_HEIGHT_MINUTES = 30;
  // The height of the SVG (i.e. height of the block) in pixels.
  static #HEIGHT = 100;
  // The stroke colour for the blocks, mainly useful when events are directly
  // adjacent to each other.
  static #BLOCK_STROKE_COLOUR = "white";
  // The stroke with for the blocks.
  static #BLOCK_STROKE_WIDTH = 0.5;
  // The stroke colour for the current time line.
  static #CURRENT_TIME_LINE_STROKE_COLOUR = "#000";
  // The stroke width for the current time line.
  static #CURRENT_TIME_LINE_STROKE_WIDTH = 1;
  // The stroke colour for the hour lines.
  static #HOUR_LINE_STROKE_COLOUR = "#eee";
  // The stroke width for the hour lines.
  static #HOUR_LINE_STROKE_WIDTH = 0.5;

  #svg;
  #currentTimeLine;
  #rangeInMinutes;

  constructor(svg, currentTimeLine, rangeInMinutes) {
    this.#svg = svg;
    this.#currentTimeLine = currentTimeLine;
    this.#rangeInMinutes = rangeInMinutes;

    // Set the current time line to the current time.
    this.updateCurrentTimeLine();
  }

  get svg() {
    return this.#svg;
  }

  get rangeInMinutes() {
    return this.#rangeInMinutes;
  }

  // Clips the SVG to a specific range of minutes.
  //
  // This also sets the width and height of the SVG appropriately.
  clip(startMinutes, endMinutes) {
    const width = endMinutes - startMinutes;

    this.#svg.setAttribute(
      "viewBox",
      `${startMinutes} 0 ${width} ${StageSchedule.#BLOCK_HEIGHT_MINUTES}`,
    );
    this.#svg.setAttribute("height", StageSchedule.#HEIGHT);
    this.#svg.setAttribute(
      "width",
      (width / StageSchedule.#BLOCK_HEIGHT_MINUTES) * StageSchedule.#HEIGHT,
    );
  }

  // Updates the current time line to the current time.
  updateCurrentTimeLine() {
    const now = new Date();
    const relativeTimeMinutes =
      (now - this.#currentTimeLine.referenceTime) / (1000 * 60);

    // If the current time is before the start of this day's schedule or after
    // its end, the line will be out of bounds, and therefore clipped off.
    const element = this.#currentTimeLine.element;
    element.setAttribute("x1", relativeTimeMinutes);
    element.setAttribute("x2", relativeTimeMinutes);
  }

  // Creates a block schedule from a schedule object for a specific day and
  // stage.
  static fromSchedule(schedule, dayId, stageId) {
    const events = schedule.getEvents(dayId, stageId);

    // Colour for this block schedule (i.e. the colour for the current stage).
    const stage = schedule.getStage(stageId);
    const stageColour = stage.colour;

    // Create a root SVG element for each block schedule.
    const svg = createSvgElement("svg");

    // Create groups for hour lines, blocks, the current time line and text.
    // They are created in that order to ensure the correct layering.
    const gHourLines = createSvgElement("g");
    const gBlocks = createSvgElement("g");
    const gCurrentTime = createSvgElement("g");
    const gText = createSvgElement("g");
    svg.appendChild(gHourLines);
    svg.appendChild(gBlocks);
    svg.appendChild(gCurrentTime);
    svg.appendChild(gText);

    // Create a vertical line for each hour, just create all the lines we may
    // possibly show: from 00:00 until 00:00 the next day.
    for (let minute = 0; minute < 48 * 60; minute += 60) {
      const line = createSvgElement("line", {
        x1: minute,
        y1: 0,
        x2: minute,
        y2: StageSchedule.#BLOCK_HEIGHT_MINUTES,
        stroke: StageSchedule.#HOUR_LINE_STROKE_COLOUR,
        "stroke-width": StageSchedule.#HOUR_LINE_STROKE_WIDTH,
      });
      gHourLines.appendChild(line);
    }

    // Create a vertical line for the current time, initialise it at 00:00, it
    // will be updated in the constructor of the StageSchedule.
    const currentTimeLineElement = createSvgElement("line", {
      x1: 0,
      y1: 0,
      x2: 0,
      y2: StageSchedule.#BLOCK_HEIGHT_MINUTES,
      stroke: StageSchedule.#CURRENT_TIME_LINE_STROKE_COLOUR,
      "stroke-width": StageSchedule.#CURRENT_TIME_LINE_STROKE_WIDTH,
    });
    gCurrentTime.appendChild(currentTimeLineElement);

    // Store the line element in an object, along with the reference time of
    // this day.
    const currentTimeLine = {
      referenceTime: schedule.getReferenceTime(dayId),
      element: currentTimeLineElement,
    };

    // Create blocks for each event, coordinates are in minutes from 00:00
    // today. Note: any events after midnight (i.e. 00:00 the next day), are
    // considered to be part of this day.
    for (const event of events) {
      const xStart = computeNumMinutes(event.start);
      const xEnd = computeNumMinutes(event.end);
      const width = xEnd - xStart;

      const rect = createSvgElement("rect", {
        x: xStart,
        y: 0,
        width: width,
        height: StageSchedule.#BLOCK_HEIGHT_MINUTES,
        fill: stageColour,
        stroke: StageSchedule.#BLOCK_STROKE_COLOUR,
        "stroke-width": StageSchedule.#BLOCK_STROKE_WIDTH,
      });
      rect.classList.add("block");
      if (event.url) {
        // If the event has a URL, add a click event to open the URL in a new
        // tab. The block will also be highlighted on hover.
        rect.classList.add("clickable");
        rect.addEventListener("click", () => window.open(event.url, "_blank"));
      }
      gBlocks.appendChild(rect);

      // Create a foreign object with a div so we can more easily have nicely
      // wrapping text, and smaller time text under the artist name.
      const foreignObject = createSvgElement("foreignObject", {
        x: xStart,
        y: 0,
        width: width,
        height: StageSchedule.#BLOCK_HEIGHT_MINUTES,
      });
      foreignObject.classList.add("block-text");
      // Create wrapping flexbox div to layout the artist name and time.
      const textContainerDiv = createXhtmlElement("div");
      textContainerDiv.classList.add("text-container");

      // Add the artist name and time to this div.
      const nameDiv = createXhtmlElement("div");
      nameDiv.classList.add("artist-name");
      nameDiv.textContent = event.name;
      const timeDiv = createXhtmlElement("div");
      timeDiv.classList.add("time");
      timeDiv.textContent = `${event.start} – ${event.end}`;

      textContainerDiv.appendChild(nameDiv);
      textContainerDiv.appendChild(timeDiv);
      foreignObject.appendChild(textContainerDiv);

      gText.appendChild(foreignObject);
    }

    // Finally, compute the start end end time in minutes for this day/stage
    // combination.
    const rangeInMinutes = schedule.getRangeInMinutes(dayId, stageId);

    return new StageSchedule(svg, currentTimeLine, rangeInMinutes);
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
    const [startMinutes, endMinutes] = this.#computeCurrentRangeInMinutes(
      dayId,
      enabledStageIds,
    );

    clearContainer(this.#container);
    const stageSchedules = this.#stageSchedules.get(dayId);
    for (const [stageId, stageSchedule] of stageSchedules) {
      const isEnabled = enabledStageIds.includes(stageId);
      if (!isEnabled) continue;

      stageSchedule.clip(startMinutes, endMinutes);
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

  #computeCurrentRangeInMinutes(dayId, enabledStageIds) {
    const stageSchedules = this.#stageSchedules.get(dayId);

    let start = Number.MAX_VALUE;
    let end = Number.MIN_VALUE;
    for (const stageId of enabledStageIds) {
      const hasStageSchedule = stageSchedules.has(stageId);
      if (!hasStageSchedule) continue;

      const [startCur, endCur] = this.#stageSchedules
        .get(dayId)
        .get(stageId).rangeInMinutes;
      if (startCur < start) start = startCur;
      if (endCur > end) end = endCur;
    }
    return [start, end];
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

  #schedule;

  #blockSchedule;

  #dayId;
  #enabledStageIds;

  constructor(daysContainer, stagesContainer, eventsContainer, schedule) {
    this.#daysContainer = daysContainer;
    this.#stagesContainer = stagesContainer;
    this.#eventsContainer = eventsContainer;

    this.#schedule = schedule;

    // Start with the first day and all stages enabled.
    this.#dayId = schedule.getDayIds()[0];
    this.#enabledStageIds = schedule.getStageIds();

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

    // Call the setDayId method to update the entire UI to the set day.
    this.#setDayId(this.#dayId);

    // Add a timer to update the current time lines every 30 seconds.
    window.setInterval(() => this.#updateCurrentTimeLines(), 30 * 1000);
    // Since timers do not continue to run when the window is out of focus, also
    // update the current time lines when the window is focused.
    window.addEventListener("focus", () => {
      this.#updateCurrentTimeLines();
    });
  }

  // Saves the day and enabled stages to local storage.
  #saveState() {
    localStorage.setItem("dayId", this.#dayId);
    localStorage.setItem(
      "enabledStageIds",
      JSON.stringify(this.#enabledStageIds),
    );
  }

  // If present, loads the day and enabled stages from local storage.
  #loadState() {
    const dayId = localStorage.getItem("dayId");
    if (dayId) this.#dayId = dayId;
    const enabledStageIds = localStorage.getItem("enabledStageIds");
    if (enabledStageIds) this.#enabledStageIds = JSON.parse(enabledStageIds);
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
