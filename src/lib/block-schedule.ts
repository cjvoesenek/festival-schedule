import { createSvgElement } from "./dom";
import type { Schedule } from "./schedule";
import { StageSchedule } from "./stage-schedule";

// Block schedule class.
//
// This class represents a block schedule for a single day, for a certain
// selection of stages.
export class BlockSchedule {
  private svg: SVGSVGElement;
  private schedule: Schedule;
  private stageSchedules: Map<string, Map<string, StageSchedule>>;
  private currentTimeLine: SVGLineElement;

  constructor(
    container: HTMLElement,
    schedule: Schedule,
    dayId: string,
    enabledStageIds: string[],
  ) {
    this.svg = createSvgElement<SVGSVGElement>("svg");
    container.appendChild(this.svg);

    this.schedule = schedule;
    this.stageSchedules = this.generateStageSchedules(schedule);

    this.createHourLines();
    this.addStageSchedules();
    this.currentTimeLine = this.createCurrentTimeLine();

    this.updateBlockSchedule(dayId, enabledStageIds);
  }

  updateBlockSchedule(dayId: string, enabledStageIds: string[]): void {
    this.hideAllStages();
    this.mapCurrentStages(dayId, enabledStageIds, (stageSchedule, index) => {
      const stageElement = stageSchedule.element;
      // Translate to the appropriate vertical position for the current
      // selection of stages.
      const yStage = index * this.schedule.getConfig().blockHeight.coords;
      stageElement.setAttribute("transform", `translate(0, ${yStage})`);
      // Unhide the enabled stages.
      stageElement.classList.remove("inactive");
      stageElement.classList.add("active");
    });

    // Clip the block schedule to the start and end of the current selection of
    // day and stages.
    this.clipToCurrentRange(dayId, enabledStageIds);
  }

  updateCurrentTimeLine(dayId: string): void {
    const now = new Date();
    const referenceTime = this.schedule.getReferenceTime(dayId);
    const xNow = StageSchedule.toSvgCoordinates(referenceTime, now);

    // If the current time is before the start of this day's schedule or after
    // its end, the line will be out of bounds, and therefore clipped off.
    const element = this.currentTimeLine;
    element.setAttribute("x1", xNow.toString());
    element.setAttribute("x2", xNow.toString());
  }

  // Returns the topmost current time line element for this schedule.
  //
  // This can be used to scroll to the current time.
  getCurrentTimeLineElement(): SVGLineElement {
    return this.currentTimeLine;
  }

  hideAllStages(): void {
    for (const daySchedule of this.stageSchedules.values()) {
      for (const stageSchedule of daySchedule.values()) {
        stageSchedule.element.classList.add("inactive");
      }
    }
  }

  private computeCurrentRangeInCoords(
    dayId: string,
    enabledStageIds: string[],
  ): [number, number] {
    const ranges = this.mapCurrentStages(
      dayId,
      enabledStageIds,
      (stageSchedule) => stageSchedule.rangeInCoords,
    );
    const start = Math.min(...ranges.map((range) => range[0]));
    const end = Math.max(...ranges.map((range) => range[1]));
    return [start, end];
  }

  private computeCurrentNumberOfAvailableStages(
    dayId: string,
    enabledStageIds: string[],
  ): number {
    const stageSchedule = this.stageSchedules.get(dayId);
    if (!stageSchedule) return 0;
    return Array.from(stageSchedule.keys()).filter((stageId) =>
      enabledStageIds.includes(stageId),
    ).length;
  }

  // Clips the SVG to a specific range of coordinates.
  //
  // This also sets the width and height of the SVG appropriately.
  private clipToCurrentRange(dayId: string, enabledStageIds: string[]): void {
    const [startCoord, endCoord] = this.computeCurrentRangeInCoords(
      dayId,
      enabledStageIds,
    );

    const blockHeight = this.schedule.getConfig().blockHeight;
    const numStages = this.computeCurrentNumberOfAvailableStages(
      dayId,
      enabledStageIds,
    );

    const widthCoords = endCoord - startCoord;
    const heightCoords = numStages * blockHeight.coords;

    const widthPixels = (widthCoords / blockHeight.coords) * blockHeight.pixels;
    const heightPixels = numStages * blockHeight.pixels;

    const updateSize = (): void => {
      this.svg.setAttribute(
        "viewBox",
        `${startCoord} 0 ${widthCoords} ${heightCoords}`,
      );
      this.svg.setAttribute("width", widthPixels.toString());
      this.svg.setAttribute("height", heightPixels.toString());
    };

    // If we are shrinking activate after 500ms to wait for our transition
    // animation to finish, if we are growing, make room for the transition
    // immediately.
    const currentHeight = this.svg.height.baseVal.value;
    const isGrowing = heightPixels > currentHeight;
    if (isGrowing) {
      updateSize();
    } else {
      window.setTimeout(updateSize, 500);
    }
  }

  private mapCurrentStages<T>(
    dayId: string,
    enabledStageIds: string[],
    func: (schedule: StageSchedule, index: number) => T,
  ): T[] {
    const stageSchedules = this.stageSchedules.get(dayId);
    if (!stageSchedules) {
      throw new Error(`No day with ID "${dayId}" exists.`);
    }

    const availableStageIds = Array.from(stageSchedules.keys()).filter(
      (stageId) => enabledStageIds.includes(stageId),
    );
    return availableStageIds.map((stageId, index) => {
      const currentSchedule = stageSchedules.get(stageId);
      if (!currentSchedule) {
        throw new Error(
          `No schedule for stage with ID "${stageId}" exists for day with ID "${dayId}".`,
        );
      }
      return func(currentSchedule, index);
    });
  }

  private generateStageSchedules(
    schedule: Schedule,
  ): Map<string, Map<string, StageSchedule>> {
    const stageSchedules: Map<string, Map<string, StageSchedule>> = new Map();
    for (const dayId of schedule.getDayIds()) {
      const currentStageSchedules: Map<string, StageSchedule> = new Map();
      stageSchedules.set(dayId, currentStageSchedules);
      for (const stageId of schedule.getStageIds(dayId)) {
        const stageSchedule = StageSchedule.fromSchedule(
          schedule,
          dayId,
          stageId,
        );
        currentStageSchedules.set(stageId, stageSchedule);
      }
    }
    return stageSchedules;
  }

  private getMaximumHeight(): number {
    const maxNumStages = Math.max(
      ...Array.from(this.stageSchedules.values()).map(
        (schedules) => schedules.size,
      ),
    );
    return this.schedule.getConfig().blockHeight.coords * maxNumStages;
  }

  // Creates a vertical line for each hour, just create all the lines we may
  // possibly show: from 00:00 until 00:00 the next day.
  private createHourLines(): void {
    const group = createSvgElement<SVGGElement>("g");
    this.svg.appendChild(group);

    const hours = StageSchedule.getHourCoordinates();
    for (let x = hours.start; x < hours.end; x += hours.step) {
      const line = createSvgElement<SVGLineElement>("line", {
        x1: x.toString(),
        y1: "0",
        x2: x.toString(),
        y2: this.getMaximumHeight().toString(),
      });
      line.classList.add("hour");
      group.appendChild(line);
    }
  }

  private addStageSchedules(): void {
    const group = createSvgElement("g");
    this.svg.appendChild(group);

    for (const dayId of this.stageSchedules.keys()) {
      const daySchedule = this.stageSchedules.get(dayId);
      if (!daySchedule) continue;
      for (const stageId of daySchedule.keys()) {
        const stageSchedule = daySchedule.get(stageId);
        if (!stageSchedule) continue;
        group.appendChild(stageSchedule.element);
      }
    }
  }

  private createCurrentTimeLine(): SVGLineElement {
    const group = createSvgElement("g");
    this.svg.appendChild(group);

    // Create a line indicating the current time. We set its height based on the
    // maximum height the schedule can attain; if fewer stages are selected, the
    // rest will just be outside the viewBox.
    const currentTimeLineElement = createSvgElement<SVGLineElement>("line", {
      x1: "0",
      y1: "0",
      x2: "0",
      y2: this.getMaximumHeight().toString(),
    });
    currentTimeLineElement.classList.add("current-time");
    group.appendChild(currentTimeLineElement);

    return currentTimeLineElement;
  }
}
