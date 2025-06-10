import concurrent.futures
import dataclasses
import json
import logging
import pathlib
import re
import sys

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
    url: str


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
    dutch_name: str
    name: str
    date: str


@dataclasses.dataclass
class ParsedEvent:
    day_id: str
    stage_id: str
    start: str
    end: str
    name: str
    url: str


def gather_special_croque_madame_events(
    metadata: str, name: str, url: str, day_dutch_name_to_id: dict[str, str]
) -> list[ParsedEvent]:
    matches: list[tuple[str, str]] = re.findall(
        r"(?P<start>\d{2}:\d{2}) - (?P<end>\d{2}:\d{2})", metadata
    )
    events: list[ParsedEvent] = []
    for day_id in day_dutch_name_to_id.values():
        for match in matches:
            start, end = match
            events.append(ParsedEvent(day_id, "croque-madame", start, end, name, url))
    return events


def gather_events_from_artist_page(
    name: str,
    url: str,
    stage_name_to_id: dict[str, str],
    day_dutch_name_to_id: dict[str, str],
) -> list[ParsedEvent]:
    response = requests.get(url)
    soup = BeautifulSoup(response.text, "html.parser")

    metadata_div = soup.find("div", class_="border")
    if metadata_div is None:
        raise RuntimeError("Could not find metadata <div> element")

    metadata = metadata_div.text
    matches: list[str] = re.findall(
        r"\w+,\s*\d{2}\s+Jul\s+2025\s+\d{2}:\d{2}\s+-\s+\d{2}:\d{2}\n[^\n]+",
        metadata,
    )
    if len(matches) == 0:
        # We may be special events on the "CROQUE Madame", so try that.
        if "Dagelijks" in metadata:
            return gather_special_croque_madame_events(
                metadata, name, url, day_dutch_name_to_id
            )

        raise RuntimeError(
            "Could not find appropriately formatted metadata in metadata <div>"
        )

    events: list[ParsedEvent] = []
    for match in matches:
        raw_datetime, stage = match.split("\n")
        stage_id = stage_name_to_id[stage.strip()]

        day = raw_datetime.split(",")[0].lower()
        day_id = day_dutch_name_to_id[day.strip()]

        time_match = re.search(
            r"(?P<start>\d{2}:\d{2}) - (?P<end>\d{2}:\d{2})", raw_datetime
        )
        if time_match is None:
            raise ValueError("Failed to parse start and end date from metadata")
        start = time_match.group("start")
        end = time_match.group("end")

        events.append(ParsedEvent(day_id, stage_id, start, end, name, url))
    return events


type EventsFuture = concurrent.futures.Future[list[ParsedEvent]]


@dataclasses.dataclass
class EventsFutureMetadata:
    name: str
    url: str


def gather_events(
    main_url: str, days: list[Day], stages: list[Stage], max_num_workers: int = 10
) -> list[ParsedEvent]:
    stage_name_to_id = {stage.name: stage.id for stage in stages}
    day_dutch_name_to_id = {day.dutch_name: day.id for day in days}

    logger.info(f'Gathering artist page links from URL "{main_url}".')
    response = requests.get(main_url)

    soup = BeautifulSoup(response.text, "html.parser")
    artist_links = soup.find_all("a", class_="group")

    futures: dict[EventsFuture, EventsFutureMetadata] = {}
    with concurrent.futures.ThreadPoolExecutor(max_workers=max_num_workers) as executor:
        # Create a future for each artist page.
        for link in artist_links:
            if not isinstance(link, Tag):
                continue
            name = link.attrs["title"]
            url = link.attrs["href"]
            if not isinstance(name, str) or not isinstance(url, str) or len(url) == 0:
                continue

            future = executor.submit(
                gather_events_from_artist_page,
                name,
                url,
                stage_name_to_id,
                day_dutch_name_to_id,
            )
            futures[future] = EventsFutureMetadata(name, url)

        # Wait for the futures (running concurrently) to complete.
        events: list[ParsedEvent] = []
        for future in concurrent.futures.as_completed(futures):
            metadata = futures[future]
            name = metadata.name
            url = metadata.url
            try:
                artist_events = future.result()
                if len(artist_events) > 0:
                    name = artist_events[0].name
                    print(f'Successfully processed page for artist "{name}".')
                    logger.info(
                        f'Successfully processed page for artist "{name}" from URL "{url}"; found {len(artist_events)} event{"s" if len(artist_events) > 1 else ""}.'
                    )
                    events += artist_events
            except Exception:
                print(f'Failed to process page for artist "{name}".', file=sys.stderr)
                logger.exception(
                    f'Failed to process page for artist "{name}" from URL "{url}".'
                )

    return events


def compute_sort_key_from_time(time: str) -> int:
    # Compute the number of minutes past 12:00.
    tokens = time.split(":")
    if len(tokens) != 2:
        raise RuntimeError("Failed to parse time string.")
    hours = int(tokens[0])
    minutes = int(tokens[1])
    if hours < 12:
        hours += 24
    return (hours - 12) * 60 + minutes


def convert_events_to_schedule(
    parsed_events: list[ParsedEvent],
    config: ScheduleConfig,
    days: list[Day],
    stages: list[Stage],
) -> Schedule:
    day_schedules: list[DaySchedule] = []
    for day in days:
        day_events: dict[str, list[Event]] = {}
        for stage in stages:
            # Find all events with the specified day and stage and sort by
            # ascending start time.
            events = sorted(
                filter(
                    lambda event: event.day_id == day.id and event.stage_id == stage.id,
                    parsed_events,
                ),
                key=lambda event: compute_sort_key_from_time(event.start),
            )
            day_events[stage.id] = list(
                map(
                    lambda parsed: Event(
                        parsed.start, parsed.end, parsed.name, parsed.url
                    ),
                    events,
                )
            )
        day_schedules.append(DaySchedule(day.id, day.name, day.date, day_events))
    return Schedule(config, stages, day_schedules)


def main() -> None:
    output_path = pathlib.Path("../schedules/dtrh2025.json")
    log_path = pathlib.Path("dtrh2025.log")

    logger.setLevel(logging.DEBUG)

    file_handler = logging.FileHandler(log_path, mode="w", encoding="utf-8")
    file_handler.setLevel(logging.DEBUG)
    logger.addHandler(file_handler)

    main_url = "https://downtherabbithole.nl/programma"
    config = ScheduleConfig(BlockHeightConfig(30, 100))
    stages = [
        Stage("hotot", "Hotot", "#e41a1c"),
        Stage("teddy-widder", "Teddy Widder", "#377eb8"),
        Stage("fuzzy-lop", "Fuzzy Lop", "#4daf4a"),
        Stage("rex", "REX", "#984ea3"),
        Stage("bizarre", "The Bizarre", "#ff7f00"),
        Stage("bossa-nova", "Bossa Nova", "#ffff33"),
        Stage("croque-madame", "the CROQUE Madame", "#a65628"),
        Stage("radiate-v", "RADIATE V", "#f781bf"),
        Stage("holding", "HOLDING", "#999999"),
    ]
    days = [
        Day("friday", "vrijdag", "Friday", "2025-07-04"),
        Day("saturday", "zaterdag", "Saturday", "2025-07-05"),
        Day("sunday", "zondag", "Sunday", "2025-07-06"),
    ]

    parsed_events = gather_events(main_url, days, stages, max_num_workers=10)

    logger.info("Converting events to schedule.")
    schedule = convert_events_to_schedule(parsed_events, config, days, stages)

    logger.info(f'Writing schedule to "{output_path}".')
    with open(output_path, "w", encoding="utf-8") as file:
        json.dump(dataclasses.asdict(schedule), file, indent=2)


if __name__ == "__main__":
    main()
