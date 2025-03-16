import type {
  DayScheduleSpecification,
  ScheduleConfig,
  ScheduleEvent,
  ScheduleSpecification,
  StageSpecification,
} from "./config";

// Festival schedule class.
//
// This contains a list of stages and a schedule, where the schedule is a list
// of days, each with a list of events for each stage.
export class Schedule {
  private config: ScheduleConfig;
  private stages: StageSpecification[];
  private schedule: DayScheduleSpecification[];
  private scheduleRanges: Map<string, Map<string, [Date, Date]>>;

  constructor(specification: ScheduleSpecification) {
    this.config = specification.config;
    this.stages = specification.stages;
    this.schedule = specification.schedule;
    // Precompute the start and end times for each stage on each day.
    this.scheduleRanges = this.computeScheduleRanges();
  }

  getConfig(): ScheduleConfig {
    return this.config;
  }

  getDayIds(): string[] {
    return this.schedule.map((day) => day.id);
  }

  getStageIds(dayId?: string): string[] {
    if (dayId === undefined) {
      // If the day ID was not specified, return all stage IDs.
      return this.stages.map((stage) => stage.id);
    } else {
      // Otherwise, return all stage IDs that have an event on the specified
      // day.
      const daySchedule = this.getDay(dayId);
      return Object.keys(daySchedule.events);
    }
  }

  hasStage(dayId: string, stageId: string): boolean {
    return this.getStageIds(dayId).includes(stageId);
  }

  getDays(): DayScheduleSpecification[] {
    return this.schedule;
  }

  getStages(dayId?: string): StageSpecification[] {
    if (dayId === undefined) {
      // Return all stages if no day ID is specified
      return this.stages;
    } else {
      const stageIds = this.getStageIds(dayId);
      return this.stages.filter((stage) => stageIds.includes(stage.id));
    }
  }

  getDay(dayId: string): DayScheduleSpecification {
    const daySchedule = this.schedule.find((day) => day.id === dayId);
    if (!daySchedule) {
      throw new Error(`No day with ID "${dayId}" exists.`);
    }
    return daySchedule;
  }

  getStage(stageId: string): StageSpecification {
    const stage = this.stages.find((stage) => stage.id === stageId);
    if (!stage) {
      throw new Error(`No stage with ID "${stageId}" exists.`);
    }
    return stage;
  }

  getEvents(dayId: string, stageId: string): ScheduleEvent[] {
    const daySchedule = this.getDay(dayId);
    const events = daySchedule.events[stageId];
    if (events === undefined) {
      throw new Error(
        `No events for stage with ID "${stageId}" exist on day with ID "${dayId}".`,
      );
    }
    return events;
  }

  getEventRange(dayId: string, event: ScheduleEvent): [Date, Date] {
    const date = this.getDay(dayId).date;
    const start = Schedule.parseDateTime(date, event.start);
    const end = Schedule.parseDateTime(date, event.end);
    return [start, end];
  }

  getRangeForStage(dayId: string, stageId: string): [Date, Date] {
    const dayRanges = this.scheduleRanges.get(dayId);
    if (!dayRanges) {
      throw new Error(`No day with ID "${dayId}" exists.`);
    }
    const stageRanges = dayRanges.get(stageId);
    if (!stageRanges) {
      throw new Error(`No stage with ID "${stageId}" exists.`);
    }
    return stageRanges;
  }

  getRange(dayId: string, stageIds: string[]): [Date, Date] {
    const availableStageIds = stageIds.filter((stageId) => {
      return this.hasStage(dayId, stageId);
    });
    const ranges = availableStageIds.map((stageId) =>
      this.getRangeForStage(dayId, stageId),
    );
    const start = new Date(
      Math.min(...ranges.map((range) => range[0].getTime())),
    );
    const end = new Date(
      Math.max(...ranges.map((range) => range[1].getTime())),
    );
    return [start, end];
  }

  // Gets the day ID for a date/time in the schedule.
  //
  // This only returns the day ID if the date/time is in the schedule for the
  // specified stages. It returns the first matching dayId if schedules overlap.
  getDayIdForDateTime(dateTime: Date, stageIds: string[]): string | null {
    for (const dayId of this.getDayIds()) {
      const [start, end] = this.getRange(dayId, stageIds);
      if (dateTime >= start && dateTime <= end) return dayId;
    }
    // Return null if the date/time is not in any of the schedules.
    return null;
  }

  // Gets the reference time for the schedule.
  //
  // This is the time relative to which other times to display the schedule are
  // computed. It is defined as midnight at the start of the specified day.
  //
  // It is returned as a Date object.
  getReferenceTime(dayId: string): Date {
    return Schedule.parseDate(this.getDay(dayId).date);
  }

  // Creates a schedule from a JSON URL.
  static async fetch(url: URL): Promise<Schedule> {
    const response = await fetch(url);
    const specification = (await response.json()) as ScheduleSpecification;
    return new Schedule(specification);
  }

  // Computes the start and end times for each stage on each day.
  private computeScheduleRanges(): Map<string, Map<string, [Date, Date]>> {
    const ranges: Map<string, Map<string, [Date, Date]>> = new Map();
    for (const day of this.getDays()) {
      ranges.set(day.id, new Map());
      const stageRanges = ranges.get(day.id)!;
      for (const stageId of this.getStageIds(day.id)) {
        const events = this.getEvents(day.id, stageId);
        const starts = events.map((event) =>
          Schedule.parseDateTime(day.date, event.start).getTime(),
        );
        const ends = events.map((event) =>
          Schedule.parseDateTime(day.date, event.end).getTime(),
        );
        const start = new Date(Math.min(...starts));
        const end = new Date(Math.max(...ends));
        stageRanges.set(stageId, [start, end]);
      }
    }
    return ranges;
  }

  // Converts a date and time to a Date object.
  //
  // The date is expected to be in the format "YYYY-MM-DD" and the time in
  // "hh:mm".
  private static parseDateTime(date: string, time: string): Date {
    const reference = Schedule.parseDate(date);

    const tokens = time.split(":").map((x) => parseInt(x));
    let hours = tokens[0];
    const minutes = tokens[1];
    if (hours === undefined || minutes === undefined) {
      throw new Error(`Failed to parse time "${time}".`);
    }
    // Schedules run into the night, so make sure that the day is increased if
    // the event is after midnight.
    if (hours < 6) {
      hours += 24;
    }
    // Compute the number of milliseconds since the reference time.
    const milliseconds = (hours * 60 + minutes) * 60 * 1000;

    // Create a new date from the reference time and the offset.
    return new Date(reference.getTime() + milliseconds);
  }

  // Parses a date string in the format "YYYY-MM-DD" and returns a Date object.
  private static parseDate(date: string): Date {
    // This assumes that the date is in the current time zone, which should be
    // OK; the schedule is only relevant if you are in the same time zone
    // anyway...
    const parsed = new Date(date);
    // Set the time to 00:00:00.000.
    parsed.setHours(0, 0, 0, 0);
    return parsed;
  }
}
