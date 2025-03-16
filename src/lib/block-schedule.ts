import type { Schedule } from "./schedule";
import { StageSchedule } from "./stage-schedule";

// Block schedule class.
//
// This class represents a block schedule for a single day, for a certain
// selection of stages.
export class BlockSchedule {
  private container: HTMLElement;
  private stageSchedules: Map<string, Map<string, StageSchedule>>;

  constructor(
    container: HTMLElement,
    schedule: Schedule,
    dayId: string,
    enabledStageIds: string[],
  ) {
    this.container = container;
    this.stageSchedules = BlockSchedule.generateStageSchedules(schedule);
    this.updateBlockSchedule(dayId, enabledStageIds);
  }

  updateBlockSchedule(dayId: string, enabledStageIds: string[]): void {
    // Clip the block schedule to the start and end of the current selection of
    // day and stages.
    const [startCoord, endCoord] = this.computeCurrentRangeInCoords(
      dayId,
      enabledStageIds,
    );

    this.clearContainer();
    this.mapCurrentStages(dayId, enabledStageIds, (stageSchedule) => {
      stageSchedule.clip(startCoord, endCoord);
      this.container.appendChild(stageSchedule.svg);
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
  clearContainer(): void {
    const container = this.container;
    while (container.lastChild) {
      container.removeChild(container.lastChild);
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

  private mapCurrentStages<T>(
    dayId: string,
    enabledStageIds: string[],
    func: (schedule: StageSchedule) => T,
  ): T[] {
    const stageSchedules = this.stageSchedules.get(dayId);
    if (!stageSchedules) {
      throw new Error(`No day with ID "${dayId}" exists.`);
    }

    const availableStageIds = Array.from(stageSchedules.keys()).filter(
      (stageId) => enabledStageIds.includes(stageId),
    );
    return availableStageIds.map((stageId) => {
      const currentSchedule = stageSchedules.get(stageId);
      if (!currentSchedule) {
        throw new Error(
          `No schedule for stage with ID "${stageId}" exists for day with ID "${dayId}".`,
        );
      }
      return func(currentSchedule);
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
