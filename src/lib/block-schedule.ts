import type { BlockHeightConfig } from "./config";
import { createSvgElement } from "./dom";
import type { Schedule } from "./schedule";
import { StageSchedule } from "./stage-schedule";

// Block schedule class.
//
// This class represents a block schedule for a single day, for a certain
// selection of stages.
export class BlockSchedule {
  private svg: SVGSVGElement;
  private blockHeight: BlockHeightConfig;
  private stageSchedules: Map<string, Map<string, StageSchedule>>;

  constructor(
    container: HTMLElement,
    schedule: Schedule,
    dayId: string,
    enabledStageIds: string[],
  ) {
    this.svg = createSvgElement<SVGSVGElement>("svg");
    container.appendChild(this.svg);

    this.blockHeight = schedule.getConfig().blockHeight;
    this.stageSchedules = BlockSchedule.generateStageSchedules(schedule);
    this.updateBlockSchedule(dayId, enabledStageIds);
  }

  updateBlockSchedule(dayId: string, enabledStageIds: string[]): void {
    // Clip the block schedule to the start and end of the current selection of
    // day and stages.
    this.clipToCurrentRange(dayId, enabledStageIds);

    this.clearSvg();
    this.mapCurrentStages(dayId, enabledStageIds, (stageSchedule, index) => {
      const stageElement = stageSchedule.element;
      // Translate to the appropriate vertical position for the current
      // selection of stages.
      const yStage = index * this.blockHeight.coords;
      stageElement.setAttribute("transform", `translate(0, ${yStage})`);

      this.svg.appendChild(stageElement);
    });
  }

  updateCurrentTimeLines(dayId: string, enabledStageIds: string[]): void {
    this.mapCurrentStages(dayId, enabledStageIds, (stageSchedule) =>
      stageSchedule.updateCurrentTimeLine(),
    );
  }

  // Returns the topmost current time line element for this schedule.
  //
  // This can be used to scroll to the current time.
  getCurrentTimeLineElement(
    dayId: string,
    enabledStageIds: string[],
  ): SVGLineElement | null {
    const elements = this.mapCurrentStages(
      dayId,
      enabledStageIds,
      (stageSchedule) => stageSchedule.getCurrentTimeLineElement(),
    );
    return elements[0] ?? null;
  }

  // Clears all children from an element.
  clearSvg(): void {
    const svg = this.svg;
    while (svg.lastChild) {
      svg.removeChild(svg.lastChild);
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

    const blockHeight = this.blockHeight;
    const numStages = this.computeCurrentNumberOfAvailableStages(
      dayId,
      enabledStageIds,
    );

    const widthCoords = endCoord - startCoord;
    const heightCoords = numStages * blockHeight.coords;

    const widthPixels = (widthCoords / blockHeight.coords) * blockHeight.pixels;
    const heightPixels = numStages * blockHeight.pixels;

    this.svg.setAttribute(
      "viewBox",
      `${startCoord} 0 ${widthCoords} ${heightCoords}`,
    );
    this.svg.setAttribute("width", widthPixels.toString());
    this.svg.setAttribute("height", heightPixels.toString());
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

  private static generateStageSchedules(
    schedule: Schedule,
  ): Map<string, Map<string, StageSchedule>> {
    const stageSchedules: Map<string, Map<string, StageSchedule>> = new Map();
    for (const dayId of schedule.getDayIds()) {
      const currentStageSchedules: Map<string, StageSchedule> = new Map();
      stageSchedules.set(dayId, currentStageSchedules);
      for (const stageId of schedule.getStageIds(dayId)) {
        currentStageSchedules.set(
          stageId,
          StageSchedule.fromSchedule(schedule, dayId, stageId),
        );
      }
    }
    return stageSchedules;
  }
}
