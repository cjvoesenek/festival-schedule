import dataclasses
import json
import logging
import pathlib
from typing import Self
import urllib.parse

from bs4 import BeautifulSoup, Tag
import requests

logger = logging.getLogger(__name__)


@dataclasses.dataclass
class Day:
    id: str
    name: str
    date: str


@dataclasses.dataclass
class ParsedEvent:
    day_id: str
    name: str
    url: str


@dataclasses.dataclass
class BlockHeightConfig:
    coords: float
    pixels: float


@dataclasses.dataclass
class ScheduleConfig:
    blockHeight: BlockHeightConfig


@dataclasses.dataclass
class Stage:
    id: str
    name: str
    colour: str


@dataclasses.dataclass
class Event:
    start: str
    end: str
    name: str
    url: str | None


@dataclasses.dataclass
class DaySchedule:
    id: str
    name: str
    date: str
    events: dict[str, list[Event]]

    @classmethod
    def empty(cls, day: Day, stages: list[Stage]) -> Self:
        events: dict[str, list[Event]] = {stage.id: [] for stage in stages}
        return cls(day.id, day.name, day.date, events)


@dataclasses.dataclass
class Schedule:
    config: ScheduleConfig
    stages: list[Stage]
    schedule: list[DaySchedule]

    def is_in_schedule(self, day_id: str, name: str) -> bool:
        day_index = self._day_id_to_index(day_id)
        for stage_events in self.schedule[day_index].events.values():
            for event in stage_events:
                if event.name == name:
                    return True
        else:
            return False

    def add_event(self, stage_id: str, day_id: str, event: Event) -> None:
        day_index = self._day_id_to_index(day_id)
        stage_events = self.schedule[day_index].events[stage_id]
        stage_events.append(event)
        stage_events.sort(key=lambda event: event.start)

    def save(self, output_path: pathlib.Path) -> None:
        prepared = dataclasses.asdict(self)
        with output_path.open("w") as file:
            json.dump(prepared, file, indent=2)

    def _day_id_to_index(self, day_id: str) -> int:
        day_index = next(i for i, day in enumerate(self.schedule) if day.id == day_id)
        assert day_index is not None
        return day_index

    @classmethod
    def load(cls, path: pathlib.Path) -> Self:
        with path.open() as file:
            raw = json.load(file)
        config = ScheduleConfig(**raw["config"])
        stages = [Stage(**raw_stage) for raw_stage in raw["stages"]]
        schedule: list[DaySchedule] = []
        for raw_day_schedule in raw["schedule"]:
            events: dict[str, list[Event]] = {}
            for stage_id, raw_stage_events in raw_day_schedule["events"].items():
                events[stage_id] = [
                    Event(**raw_event) for raw_event in raw_stage_events
                ]
            schedule.append(
                DaySchedule(
                    raw_day_schedule["id"],
                    raw_day_schedule["name"],
                    raw_day_schedule["date"],
                    events,
                )
            )
        return cls(config, stages, schedule)


def gather_events(main_url: str, days: list[Day]) -> list[ParsedEvent]:
    logger.info(f'Gathering artist page links from URL "{main_url}".')
    response = requests.get(main_url)
    soup = BeautifulSoup(response.text, "html.parser")
    artist_links = soup.find_all("a", class_="act")

    parsed_url = urllib.parse.urlparse(main_url)
    base_url = f"{parsed_url.scheme}://{parsed_url.netloc}"

    day_to_id = {day.name: day.id for day in days}

    events: list[ParsedEvent] = []
    for link in artist_links:
        assert isinstance(link, Tag)
        title = link.find("h3", class_="act__title")
        assert isinstance(title, Tag)
        name = title.text

        if name == "Many more to come":
            continue

        assert "href" in link.attrs and isinstance(link.attrs["href"], str)
        relative_url = link.attrs["href"]
        assert relative_url.startswith("/")
        absolute_url = f"{base_url}{relative_url}"

        day_container = link.find("span", class_="act__content-meta")
        assert isinstance(day_container, Tag)
        day_span = day_container.find("span")
        if day_span is None:
            # Some cases need manual treatment; skip them for now and handle them as
            # we encounter them.
            continue

        assert isinstance(day_span, Tag)
        day = day_span.text

        assert day in day_to_id
        day_id = day_to_id[day]

        events.append(ParsedEvent(day_id, name, absolute_url))

    return events


def annotate_events(
    parsed_events: list[ParsedEvent],
    stages: list[Stage],
    days: list[Day],
    schedule: Schedule,
    output_path: pathlib.Path,
) -> None:
    for day in days:
        parsed_events_for_day = (
            event for event in parsed_events if event.day_id == day.id
        )
        for parsed_event in parsed_events_for_day:
            # Check whether this event already exists, skip annotating it
            # otherwise.
            if schedule.is_in_schedule(day.id, parsed_event.name):
                logger.info(
                    f'Artist "{parsed_event.name}" already in schedule, skipping.'
                )
                continue

            print(f"{day.name}: {parsed_event.name}")
            stage_id = prompt_for_stage(stages)
            print("  Start time?")
            start_time = prompt_for_time()
            print("  End time?")
            end_time = prompt_for_end_time(start_time, default_duration_minutes=45)
            print()

            event = Event(
                time_to_string(start_time),
                time_to_string(end_time),
                parsed_event.name,
                parsed_event.url,
            )

            # Add the event and save the updated schedule.
            schedule.add_event(stage_id, day.id, event)
            schedule.save(output_path)


def time_to_string(time: tuple[int, int]) -> str:
    hours, minutes = time
    return f"{hours:02d}:{minutes:02d}"


def prompt_for_stage(stages: list[Stage]) -> str:
    num_stages = len(stages)
    for i, stage in enumerate(stages):
        print(f"    {i + 1}. {stage.name}")
    index = prompt_for_integer(1, num_stages, "stage")
    return stages[index - 1].id


def prompt_for_time() -> tuple[int, int]:
    hour = prompt_for_integer(0, 23, "  hours")
    minute = prompt_for_integer(0, 59, "  minutes")
    return hour, minute


def prompt_for_end_time(
    start_time: tuple[int, int], default_duration_minutes: int
) -> tuple[int, int]:
    start_hours, start_minutes = start_time
    default_end_minutes = start_minutes + default_duration_minutes
    default_end_hours = start_hours
    while default_end_minutes > 59:
        default_end_minutes -= 60
        default_end_hours += 1
    default_end_hours %= 24

    end_hours = prompt_for_integer(0, 23, "  hours", default_end_hours)
    end_minutes = prompt_for_integer(0, 59, "  minutes", default_end_minutes)

    return end_hours, end_minutes


def prompt_for_integer(
    start: int, end: int, name: str, default: int | None = None
) -> int:
    if default is None:
        print(f"  {name.capitalize()}? ", end="")
        error_prompt = f"  Invalid {name}: {name}? "
    else:
        print(f"  {name.capitalize()} [{default}]? ", end="")
        error_prompt = f"  Invalid {name}: {name} [{default}? "

    while True:
        raw = input()
        if raw == "" and default is not None:
            return default
        try:
            value = int(raw)
            if value < start or value > end:
                print(error_prompt, end="")
                continue
            return value
        except ValueError:
            print(error_prompt, end="")


def create_empty_schedule(
    config: ScheduleConfig, stages: list[Stage], days: list[Day]
) -> Schedule:
    day_schedules = [DaySchedule.empty(day, stages) for day in days]
    return Schedule(config, stages, day_schedules)


def main() -> None:
    output_path = pathlib.Path("../schedules/bks2026.json")
    log_path = pathlib.Path("bks2026.log")

    logger.setLevel(logging.DEBUG)

    file_handler = logging.FileHandler(log_path, mode="w", encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    logger.addHandler(file_handler)

    main_url = "https://www.bestkeptsecret.nl/program/list"
    config = ScheduleConfig(BlockHeightConfig(30, 100))

    stages = [
        Stage("one", "One", "#53b950"),
        Stage("two", "Two", "#fce112"),
        Stage("the-secret", "The Secret", "#81d4f7"),
        Stage("the-floor", "The Floor", "#735ca8"),
        Stage("the-casbah", "The Casbah", "#ed353f"),
        Stage("coney-island", "Coney Island", "#3c5fac"),
        Stage("muziekgieterij", "Muziekgieterij", "#9d3c22"),
        Stage("playground-love", "Playground Love", "#f05c2c"),
        Stage("niet-niks", "Niet Niks", "#026839"),
    ]
    days = [
        Day("friday", "Friday", "2026-06-12"),
        Day("saturday", "Saturday", "2026-06-14"),
        Day("sunday", "Sunday", "2025-06-14"),
    ]

    if not output_path.exists():
        logger.info("Creating new empty schedule.")
        schedule = create_empty_schedule(config, stages, days)
        schedule.save(output_path)
    else:
        logger.info(f'Loading existing schedule from "{output_path}".')
        schedule = Schedule.load(output_path)
    print(schedule)

    parsed_events = gather_events(main_url, days)
    annotate_events(parsed_events, stages, days, schedule, output_path)

    # logger.info("Converting events to schedule.")
    # schedule = convert_events_to_schedule(parsed_events, config, days, stages)

    # logger.info(f'Writing schedule to "{output_path}".')
    # with open(output_path, "w", encoding="utf-8") as file:
    #     json.dump(dataclasses.asdict(schedule), file, indent=2)


if __name__ == "__main__":
    main()
