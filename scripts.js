main();

let enabledStageIds = [];
const blockHeightMinutes = 30;
const blockHeight = 100;

class Schedule {
  constructor(stages, schedule) {
    this.stages = stages;
    this.schedule = schedule;
  }

  getDayIds() {
    return this.schedule.map((day) => day.id);
  }

  getStageIds(dayId) {
    if (dayId === undefined) {
      return this.stages.map((stage) => stage.id);
    } else {
      return Object.keys(this.schedule.find((day) => day.id === dayId).events);
    }
  }

  getStage(stageId) {
    return this.stages.find((stage) => stage.id === stageId);
  }

  getEvents(dayId, stageId) {
    return this.schedule.find((day) => day.id === dayId).events[stageId];
  }

  static async fetch(url) {
    const response = await fetch(url);
    const data = await response.json();
    const stages = data.stages;
    const schedule = data.schedule;
    return new Schedule(stages, schedule);
  }
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
      const events = schedule.getEvents(dayId, stageId);
      const stage = schedule.getStage(stageId);
      const svg = generateStageBlockSchedule(events, stage, "12:00", "04:00");
      blockSchedules[dayId][stageId] = svg;
    }
  }
  return blockSchedules;
}

function parseTime(time) {
  let [hours, minutes] = time.split(":").map((x) => parseInt(x));
  if (hours < 12) {
    hours += 24;
  }
  return hours * 60 + minutes;
}

function createSvgElement(tag, attributes) {
  const el = document.createElementNS("http://www.w3.org/2000/svg", tag);
  for (const [key, value] of Object.entries(attributes)) {
    el.setAttribute(key, value);
  }
  return el;
}

function generateStageBlockSchedule(
  schedule,
  stage,
  scheduleStart,
  scheduleEnd,
) {
  const startMinutes = parseTime(scheduleStart);
  const endMinutes = parseTime(scheduleEnd);

  const range = endMinutes - startMinutes;

  const svg = createSvgElement("svg", {
    viewBox: `${startMinutes} 0 ${range} ${blockHeightMinutes}`,
    preserveAspectRatio: "none",
  });
  svg.setAttribute("height", blockHeight);
  svg.setAttribute("width", (range / blockHeightMinutes) * blockHeight);

  for (const event of schedule) {
    const eventStartMinutes = parseTime(event.start);
    const eventEndMinutes = parseTime(event.end);

    const xStart = eventStartMinutes;
    const xEnd = eventEndMinutes;
    const width = xEnd - xStart;
    const rect = createSvgElement("rect", {
      x: xStart,
      y: 0,
      width: width,
      height: blockHeightMinutes,
      fill: stage.colour,
      stroke: "white",
      "stroke-width": 0.5,
    });
    rect.style.cursor = "pointer";
    // If we have a URL, clicking the block navigate to the artist's page on
    // the BKS website.
    if (event.url) {
      rect.addEventListener("click", () => window.open(event.url, "_blank"));
    }
    svg.appendChild(rect);

    const foreignObject = createSvgElement("foreignObject", {
      x: xStart,
      y: 0,
      width: width,
      height: blockHeightMinutes,
    });
    const textContainerDiv = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    textContainerDiv.classList.add("block");
    const nameDiv = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    nameDiv.textContent = event.name;
    const timeDiv = document.createElementNS(
      "http://www.w3.org/1999/xhtml",
      "div",
    );
    timeDiv.classList.add("time");
    timeDiv.textContent = `${event.start} – ${event.end}`;

    textContainerDiv.appendChild(nameDiv);
    textContainerDiv.appendChild(timeDiv);

    foreignObject.appendChild(textContainerDiv);
    svg.appendChild(foreignObject);
  }

  return svg;
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
    .map(parseTime);
  const selectedEndMinutes = Object.entries(daySchedule.events)
    .filter(([stageId, _]) => stageIds.includes(stageId))
    .map(([_, stageSchedule]) => stageSchedule[stageSchedule.length - 1].end)
    .map(parseTime);

  // Find the minimum and maximum, to set in SVG viewboxes.
  const startMinutes = Math.min(...selectedStartMinutes);
  const endMinutes = Math.max(...selectedEndMinutes);
  const range = endMinutes - startMinutes;

  for (const stageId in blockSchedules) {
    if (!stageIds.includes(stageId)) continue;
    const svg = blockSchedules[stageId];
    svg.setAttribute(
      "viewBox",
      `${startMinutes} 0 ${range} ${blockHeightMinutes}`,
    );
    svg.setAttribute("height", blockHeight);
    svg.setAttribute("width", (range / blockHeightMinutes) * blockHeight);

    container.appendChild(svg);
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
