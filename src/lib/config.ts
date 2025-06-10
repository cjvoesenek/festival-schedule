export interface ScheduleSpecification {
  config: ScheduleConfig;
  stages: StageSpecification[];
  schedule: DayScheduleSpecification[];
}

export interface ScheduleConfig {
  blockHeight: BlockHeightConfig;
}

export interface BlockHeightConfig {
  coords: number;
  pixels: number;
}

export interface StageSpecification {
  id: string;
  name: string;
  colour: string;
}

export interface DayScheduleSpecification {
  id: string;
  name: string;
  date: string;
  events: Record<string, ScheduleEvent[]>;
}

export interface ScheduleEvent {
  start: string;
  end: string;
  name: string;
  url: string | null;
}
