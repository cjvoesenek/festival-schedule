import "./main.css";
import bks2024 from "../schedules/bks2024.json";

import { App, Schedule } from "./lib";

function main(): void {
  const schedule = new Schedule(bks2024);

  const daysContainer = document.querySelector("#days") as HTMLDivElement;
  const stagesContainer = document.querySelector("#stages") as HTMLDivElement;
  const eventsContainer = document.querySelector("#events") as HTMLDivElement;
  const nowButton = document.querySelector("#now-button") as HTMLDivElement;

  new App(daysContainer, stagesContainer, eventsContainer, nowButton, schedule);
}

// Run the main function.
main();
