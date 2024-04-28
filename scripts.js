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
  if (hours < 12) {
    hours += 24;
  }
  return hours * 60 + minutes;
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

  getStage(stageId) {
    return this.#stages.find((stage) => stage.id === stageId);
  }

  getEvents(dayId, stageId) {
    return this.#schedule.find((day) => day.id === dayId).events[stageId];
  }

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
  static #STROKE_COLOUR = "white";
  // The stroke with for the blocks.
  static #STROKE_WIDTH = 0.5;

  #svg;
  #rangeInMinutes;

  constructor(svg, rangeInMinutes) {
    this.#svg = svg;
    this.#rangeInMinutes = rangeInMinutes;
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

  // Creates a block schedule from a schedule object for a specific day and
  // stage.
  static fromSchedule(schedule, dayId, stageId) {
    const events = schedule.getEvents(dayId, stageId);

    // Colour for this block schedule (i.e. the colour for the current stage).
    const stage = schedule.getStage(stageId);
    const stageColour = stage.colour;

    // Create a root SVG element for each block schedule.
    const svg = createSvgElement("svg");

    // Create groups for blocks and text.
    const gBlocks = createSvgElement("g", {});
    const gText = createSvgElement("g", {});
    svg.appendChild(gBlocks);
    svg.appendChild(gText);

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
        stroke: StageSchedule.#STROKE_COLOUR,
        "stroke-width": StageSchedule.#STROKE_WIDTH,
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

    return new StageSchedule(svg, rangeInMinutes);
  }
}

// Block schedule class.
//
// This class represents a block schedule for a single day, for a certain
// selection of stages.
class BlockSchedule {
  #container;
  #stageSchedules;
  #dayId;
  #enabledStageIds;

  constructor(container, schedule, dayId, enabledStageIds) {
    this.#container = container;
    this.#stageSchedules = this.#generateStageSchedules(schedule);
    this.#dayId = dayId;
    this.#enabledStageIds = [...enabledStageIds];
    this.#updateBlockSchedule();
  }

  setDayId(dayId) {
    this.#dayId = dayId;
    this.#updateBlockSchedule();
  }

  toggleStageId(stageId) {
    if (this.#enabledStageIds.includes(stageId)) {
      this.#enabledStageIds = this.#enabledStageIds.filter(
        (id) => id !== stageId,
      );
    } else {
      this.#enabledStageIds.push(stageId);
    }
    this.#updateBlockSchedule();
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

  #updateBlockSchedule() {
    // Clip the block schedule to the start and end of the current selection of
    // day and stages.
    const [startMinutes, endMinutes] = this.#computeCurrentRangeInMinutes();

    clearContainer(this.#container);
    const stageSchedules = this.#stageSchedules.get(this.#dayId);
    for (const stageId of this.#enabledStageIds) {
      const hasStageSchedule = stageSchedules.has(stageId);
      if (!hasStageSchedule) continue;

      const stageSchedule = stageSchedules.get(stageId);
      stageSchedule.clip(startMinutes, endMinutes);
      this.#container.appendChild(stageSchedule.svg);
    }
  }

  #computeCurrentRangeInMinutes() {
    const stageSchedules = this.#stageSchedules.get(this.#dayId);

    let start = Number.MAX_VALUE;
    let end = Number.MIN_VALUE;
    for (const stageId of this.#enabledStageIds) {
      const hasStageSchedule = stageSchedules.has(stageId);
      if (!hasStageSchedule) continue;

      const [startCur, endCur] = this.#stageSchedules
        .get(this.#dayId)
        .get(stageId).rangeInMinutes;
      if (startCur < start) start = startCur;
      if (endCur > end) end = endCur;
    }
    return [start, end];
  }
}

async function main() {
  const schedule = await Schedule.fetch("schedule.json");

  const dayId = schedule.getDayIds()[0];
  const enabledStageIds = schedule.getStageIds();

  const container = document.querySelector("#events");
  const blockSchedule = new BlockSchedule(
    container,
    schedule,
    dayId,
    enabledStageIds,
  );
}

// Run the main function.
main();
