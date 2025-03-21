import type { ScheduleEvent } from "./config";
import { createSvgElement, createXhtmlElement } from "./dom";
import type { Schedule } from "./schedule";

interface HourCoordinates {
  start: number;
  end: number;
  step: number;
}

// Stage schedule class.
//
// This class represents a block schedule for a single stage on a single day as
// an SVG element.
export class StageSchedule {
  readonly element: SVGGElement;
  readonly rangeInCoords: [number, number];

  constructor(group: SVGGElement, rangeInCoords: [number, number]) {
    this.element = group;
    this.rangeInCoords = rangeInCoords;
  }

  static fromSchedule(
    schedule: Schedule,
    dayId: string,
    stageId: string,
  ): StageSchedule {
    const builder = new StageScheduleBuilder(schedule, dayId, stageId);
    return builder.buildStageSchedule();
  }

  // Converts a date/time to SVG coordinates.
  //
  // The reference time is the start of the day, and the SVG coordinates are in
  // minutes from that time.
  static toSvgCoordinates(reference: Date, dateTime: Date): number {
    return (dateTime.getTime() - reference.getTime()) / (1000 * 60);
  }

  // Gets the start coordinate, end coordinate and step size for an hour in a
  // stage schedule.
  static getHourCoordinates(): HourCoordinates {
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
  private dayId: string;
  private stageId: string;
  private schedule: Schedule;
  private stageColour: string;
  private referenceTime: Date;
  private borderRadius: number;

  constructor(schedule: Schedule, dayId: string, stageId: string) {
    this.dayId = dayId;
    this.stageId = stageId;
    this.schedule = schedule;
    this.stageColour = schedule.getStage(stageId).colour;
    this.referenceTime = schedule.getReferenceTime(dayId);
    this.borderRadius = this.getBorderRadius();
  }

  // Creates a block schedule from a schedule object for a specific day and
  // stage.
  buildStageSchedule(): StageSchedule {
    // Create a root SVG element for this stage's block schedule.
    const group = createSvgElement<SVGGElement>("g");
    group.classList.add("stage-schedule");

    // Create groups for hour lines, blocks, the current time line and text.
    const [gBlocks, gText] = this.createBlocks();

    // Append the groups in a specific order to ensure they are layered
    // appropriately (from bottom to top).
    group.appendChild(gBlocks);
    group.appendChild(gText);

    const range = this.schedule.getRangeForStage(this.dayId, this.stageId);
    const rangeInCoords = range.map((time) =>
      StageSchedule.toSvgCoordinates(this.referenceTime, time),
    ) as [number, number];

    return new StageSchedule(group, rangeInCoords);
  }

  // Creates blocks for each event.
  //
  // Note: any events after midnight (i.e. 00:00 the next day), are considered
  // to be part of this day. Blocks and their associated text are created in
  // separate groups, since they need to be layered differently with respect to
  // the hour and current time lines.
  private createBlocks(): [SVGGElement, SVGGElement] {
    const gBlocks = createSvgElement<SVGGElement>("g");
    const gText = createSvgElement<SVGGElement>("g");

    const events = this.schedule.getEvents(this.dayId, this.stageId);
    for (const event of events) {
      const [start, end] = this.schedule.getEventRange(this.dayId, event);
      const xStart = StageSchedule.toSvgCoordinates(this.referenceTime, start);
      const xEnd = StageSchedule.toSvgCoordinates(this.referenceTime, end);
      const width = xEnd - xStart;

      const block = this.createBlock(xStart, width, event);
      const blockText = this.createBlockText(xStart, width, event);

      gBlocks.appendChild(block);
      gText.appendChild(blockText);
    }
    return [gBlocks, gText];
  }

  // Creates a single block for an event.
  private createBlock(
    xStart: number,
    width: number,
    event: ScheduleEvent,
  ): SVGRectElement {
    const config = this.schedule.getConfig();
    const rect = createSvgElement<SVGRectElement>("rect", {
      x: xStart.toString(),
      y: "0",
      width: width.toString(),
      height: config.blockHeight.coords.toString(),
      fill: this.stageColour,
      rx: this.borderRadius.toString(),
      ry: this.borderRadius.toString(),
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
  private createBlockText(
    xStart: number,
    width: number,
    event: ScheduleEvent,
  ): SVGForeignObjectElement {
    const config = this.schedule.getConfig();
    const foreignObject = createSvgElement<SVGForeignObjectElement>(
      "foreignObject",
      {
        x: xStart.toString(),
        y: "0",
        width: width.toString(),
        height: config.blockHeight.coords.toString(),
      },
    );
    foreignObject.classList.add("block-text");
    // Create wrapping flexbox div to layout the artist name and time.
    const textContainerDiv = createXhtmlElement<HTMLDivElement>("div");
    textContainerDiv.classList.add("text-container");

    // Add the artist name and time to this div.
    const nameDiv = createXhtmlElement<HTMLDivElement>("div");
    nameDiv.classList.add("artist-name");
    nameDiv.textContent = event.name;
    const timeDiv = createXhtmlElement<HTMLDivElement>("div");
    timeDiv.classList.add("time");
    timeDiv.textContent = `${event.start} – ${event.end}`;

    textContainerDiv.appendChild(nameDiv);
    textContainerDiv.appendChild(timeDiv);
    foreignObject.appendChild(textContainerDiv);

    return foreignObject;
  }

  private getBorderRadius(): number {
    const dayElement = document.querySelector("#days > div");
    // If there are no day elements, fall back to a default.
    if (!dayElement) return 2;
    // Obtain the border radius used for the day elements, then convert it to
    // SVG coordinates.
    const style = getComputedStyle(dayElement);
    // parseFloat will just strip off the "px"...
    const radiusPixels = parseFloat(style.borderRadius);

    const blockHeight = this.schedule.getConfig().blockHeight;
    const factor = blockHeight.coords / blockHeight.pixels;
    return radiusPixels * factor;
  }
}
