main();

let enabledStageIds = [];
const blockHeightMinutes = 30;
const blockHeight = 100;

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

  static async fetch(url) {
    const response = await fetch(url);
    const data = await response.json();
    const stages = data.stages;
    const schedule = data.schedule;
    return new Schedule(stages, schedule);
  }
}

// Block schedule class.
//
// This class represents a block schedule for a single stage on a single day as
// an SVG element.
class BlockSchedule {
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

  constructor(svg) {
    this.#svg = svg;
  }

  get svg() {
    return this.#svg;
  }

  // Clips the SVG to a specific range of minutes.
  //
  // This also sets the width and height of the SVG appropriately.
  clip(startMinutes, endMinutes) {
    const width = endMinutes - startMinutes;

    this.#svg.setAttribute(
      "viewBox",
      `${startMinutes} 0 ${width} ${BlockSchedule.#BLOCK_HEIGHT_MINUTES}`,
    );
    this.#svg.setAttribute("height", blockHeight);
    this.#svg.setAttribute(
      "width",
      (width / BlockSchedule.#BLOCK_HEIGHT_MINUTES) * BlockSchedule.#HEIGHT,
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
        height: BlockSchedule.#BLOCK_HEIGHT_MINUTES,
        fill: stageColour,
        stroke: BlockSchedule.#STROKE_COLOUR,
        "stroke-width": BlockSchedule.#STROKE_WIDTH,
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
        height: BlockSchedule.#BLOCK_HEIGHT_MINUTES,
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

    return new BlockSchedule(svg);
  }
}

// Helper functions
function createElement(tag, ns, attributes) {
  const el = document.createElementNS(ns, tag);
  if (attributes) {
    for (const [key, value] of Object.entries(attributes)) {
      el.setAttribute(key, value);
    }
  }
  return el;
}

function createSvgElement(tag, attributes) {
  return createElement(tag, "http://www.w3.org/2000/svg", attributes);
}

function createXhtmlElement(tag, attributes) {
  return createElement(tag, "http://www.w3.org/1999/xhtml", attributes);
}

function computeNumMinutes(time) {
  let [hours, minutes] = time.split(":").map((x) => parseInt(x));
  if (hours < 12) {
    hours += 24;
  }
  return hours * 60 + minutes;
}

async function main() {
  const [stages, scheduleOld] = await fetchSchedule("schedule.json");
  const schedule = await Schedule.fetch("schedule.json");

  enabledStageIds = stages.map((stage) => stage.id);

  const blockSchedules = generateBlockSchedules(schedule);

  populateDays(scheduleOld, stages, blockSchedules);

  showDay(scheduleOld, stages, blockSchedules, scheduleOld[0].id);
}

function generateBlockSchedules(schedule) {
  const blockSchedules = {};
  for (const dayId of schedule.getDayIds()) {
    blockSchedules[dayId] = {};
    for (const stageId of schedule.getStageIds(dayId)) {
      blockSchedules[dayId][stageId] = BlockSchedule.fromSchedule(
        schedule,
        dayId,
        stageId,
      );
    }
  }
  return blockSchedules;
}

async function fetchSchedule(url) {
  const response = await fetch(url);
  const data = await response.json();
  const stages = data.stages;
  const schedule = data.schedule;
  return [stages, schedule];
}

function populateDays(schedule, stages, blockSchedules) {
  const container = document.querySelector("#days");

  for (const day of schedule) {
    const dayElement = document.createElement("div");
    dayElement.setAttribute("id", `day-${day.id}`);
    dayElement.classList.add("day");
    dayElement.classList.add("inactive");
    dayElement.textContent = day.name;
    container.appendChild(dayElement);

    dayElement.addEventListener("click", () =>
      showDay(schedule, stages, blockSchedules, day.id),
    );
  }
}

function showDay(schedule, stages, blockSchedules, dayId) {
  const events = schedule.find((d) => d.id === dayId).events;
  const allStageIds = Object.keys(events);

  const dayElements = document.querySelectorAll(".day");
  for (const el of dayElements) {
    if (el.id === `day-${dayId}`) {
      el.classList.remove("inactive");
      el.classList.add("active");
    } else {
      el.classList.add("inactive");
      el.classList.remove("active");
    }
  }

  populateStages(schedule, blockSchedules[dayId], stages, dayId, allStageIds);
  populateSchedule(schedule, blockSchedules[dayId], dayId, enabledStageIds);
}

function populateStages(schedule, blockSchedules, allStages, dayId, stageIds) {
  const stages = allStages.filter((stage) => stageIds.includes(stage.id));

  const container = document.querySelector("#stages");
  clearContainer(container);

  for (const stage of stages) {
    const stageElement = document.createElement("div");
    stageElement.setAttribute("id", `stage-${stage.id}`);
    stageElement.classList.add("stage");
    if (!enabledStageIds.includes(stage.id)) {
      stageElement.classList.add("disabled");
    }

    stageElement.style.backgroundColor = stage.colour;

    const stageTextElement = document.createElement("div");
    stageTextElement.textContent = stage.name;

    stageElement.appendChild(stageTextElement);
    container.appendChild(stageElement);

    stageElement.addEventListener("click", () =>
      toggleStage(schedule, blockSchedules, dayId, stage.id),
    );
  }
}

function populateSchedule(schedule, blockSchedules, dayId, stageIds) {
  const container = document.querySelector("#events");
  clearContainer(container);

  // Recompute start and end time.
  const daySchedule = schedule.find((d) => d.id === dayId);
  const selectedStartMinutes = Object.entries(daySchedule.events)
    .filter(([stageId, _]) => stageIds.includes(stageId))
    .map(([_, stageSchedule]) => stageSchedule[0].start)
    .map(computeNumMinutes);
  const selectedEndMinutes = Object.entries(daySchedule.events)
    .filter(([stageId, _]) => stageIds.includes(stageId))
    .map(([_, stageSchedule]) => stageSchedule[stageSchedule.length - 1].end)
    .map(computeNumMinutes);

  // Find the minimum and maximum, to set in SVG viewboxes.
  const startMinutes = Math.min(...selectedStartMinutes);
  const endMinutes = Math.max(...selectedEndMinutes);
  const range = endMinutes - startMinutes;

  for (const stageId in blockSchedules) {
    if (!stageIds.includes(stageId)) continue;
    const blockSchedule = blockSchedules[stageId];
    blockSchedule.clip(startMinutes, endMinutes);
    container.appendChild(blockSchedule.svg);
  }
}

function toggleStage(schedule, blockSchedules, dayId, stageId) {
  const el = document.querySelector(`#stage-${stageId}`);
  if (enabledStageIds.includes(stageId)) {
    enabledStageIds = enabledStageIds.filter((id) => id !== stageId);
    el.classList.add("disabled");
  } else {
    enabledStageIds.push(stageId);
    el.classList.remove("disabled");
  }
  populateSchedule(schedule, blockSchedules, dayId, enabledStageIds);
}

function clearContainer(container) {
  while (container.children.length > 0) {
    container.removeChild(container.lastChild);
  }
}
