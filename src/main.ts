import "./main.css";
import dtrh2025 from "../schedules/dtrh2025.json";
import { version } from "../package.json";

import { App, Schedule } from "./lib";

function main(): void {
  // Create schedule and application state manager.
  const schedule = new Schedule(dtrh2025);

  const daysContainer = document.querySelector("#days") as HTMLDivElement;
  const stagesContainer = document.querySelector("#stages") as HTMLDivElement;
  const eventsContainer = document.querySelector("#events") as HTMLDivElement;
  const nowButton = document.querySelector("#button-now") as HTMLDivElement;

  new App(daysContainer, stagesContainer, eventsContainer, nowButton, schedule);

  // Set version string in label.
  const versionLabel = document.querySelector(
    "#version-label > a",
  ) as HTMLAnchorElement;
  versionLabel.textContent = version;
}

// Run the main function.
main();
