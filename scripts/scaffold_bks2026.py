import dataclasses
import logging
import pathlib
import urllib.parse

from bs4 import BeautifulSoup, Tag
import requests

logger = logging.getLogger(__name__)


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


@dataclasses.dataclass
class Schedule:
    config: ScheduleConfig
    stages: list[Stage]
    schedule: list[DaySchedule]


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
        assert isinstance(day_span, Tag)
        day = day_span.text

        day_id = day_to_id[day]

        events.append(ParsedEvent(day_id, name, absolute_url))

    return events


def annotate_events(
    parsed_events: list[ParsedEvent], stages: list[Stage], days: list[Day]
) -> None:
    for day in days:
        parsed_events_for_day = (
            event for event in parsed_events if event.day_id == day.id
        )
        for parsed_event in parsed_events_for_day:
            print(f"{day.name}: {parsed_event.name}")
            stage_id = prompt_for_stage(stages)
            start_time = prompt_for_time()
            end_time = prompt_for_end_time(start_time, default_duration_minutes=45)

            event = Event(
                time_to_string(start_time),
                time_to_string(end_time),
                parsed_event.name,
                parsed_event.url,
            )
            print(event)


def time_to_string(time: tuple[int, int]) -> str:
    hours, minutes = time
    return f"{hours}:{minutes}"


def prompt_for_stage(stages: list[Stage]) -> str:
    num_stages = len(stages)
    for i, stage in enumerate(stages):
        print(f"    {i + 1}. {stage.name}")
    index = prompt_for_integer(1, num_stages, "stage")
    return stages[index - 1].id


def prompt_for_time() -> tuple[int, int]:
    hour = prompt_for_integer(0, 23, "hours")
    minute = prompt_for_integer(0, 59, "minutes")
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

    end_hours = prompt_for_integer(0, 23, "hours", default_end_hours)
    end_minutes = prompt_for_integer(0, 59, "minutes", default_end_minutes)

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

    parsed_events = gather_events(main_url, days)
    annotate_events(parsed_events, stages, days)

    # logger.info("Converting events to schedule.")
    # schedule = convert_events_to_schedule(parsed_events, config, days, stages)

    # logger.info(f'Writing schedule to "{output_path}".')
    # with open(output_path, "w", encoding="utf-8") as file:
    #     json.dump(dataclasses.asdict(schedule), file, indent=2)


if __name__ == "__main__":
    main()
