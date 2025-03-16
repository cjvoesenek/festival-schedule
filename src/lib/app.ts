import { BlockSchedule } from "./block-schedule";
import type { Schedule } from "./schedule";

// Class representing the application.
//
// This class manages the state of the application, including the selected day
// and stages.
export class App {
  private daysContainer: HTMLDivElement;
  private stagesContainer: HTMLDivElement;
  private eventsContainer: HTMLDivElement;
  private nowButton: HTMLDivElement;

  private dayElements: Map<string, HTMLDivElement>;
  private stageElements: Map<string, HTMLDivElement>;

  private schedule: Schedule;
  private blockSchedule: BlockSchedule;

  private dayId: string;
  private enabledStageIds: string[];
  private dayIdCurrentTime: string | null;
  private scrollPosition: number | null;

  constructor(
    daysContainer: HTMLDivElement,
    stagesContainer: HTMLDivElement,
    eventsContainer: HTMLDivElement,
    nowButton: HTMLDivElement,
    schedule: Schedule,
  ) {
    this.daysContainer = daysContainer;
    this.stagesContainer = stagesContainer;
    this.eventsContainer = eventsContainer;
    this.nowButton = nowButton;

    this.schedule = schedule;

    // Start with the first day and all stages enabled.
    const firstDayId = schedule.getDayIds()[0];
    if (!firstDayId) {
      throw new Error("Cannot render schedule without days.");
    }
    this.dayId = firstDayId;
    this.enabledStageIds = schedule.getStageIds();
    this.dayIdCurrentTime = null;
    this.scrollPosition = null;

    // If present, load the state from local storage.
    this.loadState();

    this.dayElements = new Map();
    this.stageElements = new Map();

    this.populateDays();
    this.populateStages();
    this.blockSchedule = new BlockSchedule(
      this.eventsContainer,
      schedule,
      this.dayId,
      this.enabledStageIds,
    );
    // Restore the scroll position if it was set in the saved state.
    this.restoreScrollPosition();

    // Call the setDayId method to update the entire UI to the set day.
    this.setDayId(this.dayId);

    // Save the scroll position when the user finishes scrolling, so it can be
    // restored the next time the page is opened.
    eventsContainer.addEventListener("scrollend", () => {
      this.saveScrollPosition();
    });

    // The page may in some (low resolution/small window) situations also be
    // scrolled vertically. In these situations it is more intuitive that the
    // mouse wheel scrolls vertically. However, when the page cannot be scrolled
    // vertically, the mouse wheel should scroll each container horizontally.
    const wheelCallback = (
      container: HTMLDivElement,
      event: WheelEvent,
    ): void => {
      const root = document.documentElement;
      const canScrollVertically = root.scrollHeight > root.clientHeight;
      if (canScrollVertically) return;

      event.preventDefault();
      container.scrollLeft += event.deltaY;
    };
    this.daysContainer.addEventListener("wheel", (event) =>
      wheelCallback(this.daysContainer, event),
    );
    this.stagesContainer.addEventListener("wheel", (event) =>
      wheelCallback(this.stagesContainer, event),
    );
    this.eventsContainer.addEventListener("wheel", (event) =>
      wheelCallback(this.eventsContainer, event),
    );

    // Clicking the "now" button should scroll to the current time.
    this.nowButton.addEventListener("click", () => {
      // If the current time is not in the schedule, do nothing (the button
      // should be disabled anyway)...
      if (!this.dayIdCurrentTime) return;

      // Set the current day and scroll to the current time line.
      this.setDayId(this.dayIdCurrentTime);
      const currentTimeLineElement =
        this.blockSchedule.getCurrentTimeLineElement(
          this.dayId,
          this.enabledStageIds,
        );
      if (!currentTimeLineElement) return;

      currentTimeLineElement.scrollIntoView({
        behavior: "smooth",
        inline: "center",
      });
    });

    // Add a timer to update the current time lines every 30 seconds.
    window.setInterval(() => this.updateForCurrentTime(), 30 * 1000);
    // Also run the callback once to update for the current time immediately.
    this.updateForCurrentTime();

    // Since timers do not continue to run when the window is out of focus, also
    // update the current time lines when the window is focused.
    window.addEventListener("focus", () => {
      this.updateForCurrentTime();
    });
  }

  // Saves the day and enabled stages to local storage.
  private saveState(): void {
    localStorage.setItem("dayId", this.dayId);
    localStorage.setItem(
      "enabledStageIds",
      JSON.stringify(this.enabledStageIds),
    );
    if (this.scrollPosition !== null) {
      localStorage.setItem("scrollPosition", this.scrollPosition.toString());
    }
  }

  // If present, loads the day and enabled stages from local storage.
  private loadState(): void {
    const dayId = localStorage.getItem("dayId");
    if (dayId) {
      this.dayId = dayId;
    }
    const enabledStageIds = localStorage.getItem("enabledStageIds");
    if (enabledStageIds) {
      this.enabledStageIds = JSON.parse(enabledStageIds) as string[];
    }
    const scrollPosition = localStorage.getItem("scrollPosition");
    if (scrollPosition) {
      this.scrollPosition = parseFloat(scrollPosition);
    }
  }

  // Populates the days container with days.
  //
  // This only has to be called once, so we do not empty the container.
  private populateDays(): void {
    for (const day of this.schedule.getDays()) {
      const dayElement = document.createElement("div");
      dayElement.classList.add("day");

      const isSelected = day.id === this.dayId;
      dayElement.classList.add(isSelected ? "active" : "inactive");
      dayElement.textContent = day.name;

      dayElement.addEventListener("click", () => this.setDayId(day.id));

      this.dayElements.set(day.id, dayElement);
      this.daysContainer.appendChild(dayElement);
    }
  }

  // Populates the stages container with stages.
  //
  // We add all stages to the DOM, and show or hide them depending on the
  // enabled stages.
  private populateStages(): void {
    for (const stage of this.schedule.getStages()) {
      const stageElement = document.createElement("div");
      stageElement.classList.add("stage");

      stageElement.style.backgroundColor = stage.colour;

      stageElement.addEventListener("click", () =>
        this.toggleStageId(stage.id),
      );

      const stageTextElement = document.createElement("div");
      stageTextElement.textContent = stage.name;

      stageElement.appendChild(stageTextElement);

      this.stageElements.set(stage.id, stageElement);
      this.stagesContainer.appendChild(stageElement);
    }
  }

  private restoreScrollPosition(): void {
    if (this.scrollPosition !== null) {
      this.eventsContainer.scrollLeft = this.scrollPosition;
    }
  }

  private updateStages(): void {
    for (const stage of this.schedule.getStages()) {
      const stageElement = this.stageElements.get(stage.id);
      if (!stageElement) {
        throw new Error(
          `No container was created for stage with ID "${stage.id}."`,
        );
      }

      // Check whether the stage is available for this day and add the
      // appropriate class if it is not.
      if (!this.schedule.hasStage(this.dayId, stage.id)) {
        stageElement.classList.add("unavailable");
        continue;
      } else {
        stageElement.classList.remove("unavailable");
      }
      // Check whether the stage is enabled and add the appropriate class.
      const isSelected = this.enabledStageIds.includes(stage.id);
      stageElement.classList.add(isSelected ? "active" : "inactive");
    }
  }

  updateForCurrentTime(): void {
    this.updateCurrentTimeLines();
    // Check whether the "now" button should be shown. It should only be visible
    // when the current time is within any day of the schedule. In this case,
    // a dayId will be returned from the getDayIdForDateTime method.
    const now = new Date();
    this.dayIdCurrentTime = this.schedule.getDayIdForDateTime(
      now,
      this.enabledStageIds,
    );
    if (this.dayIdCurrentTime) {
      this.nowButton.classList.remove("unavailable");
    } else {
      this.nowButton.classList.add("unavailable");
    }
  }

  private updateCurrentTimeLines(): void {
    this.blockSchedule.updateCurrentTimeLines(this.dayId, this.enabledStageIds);
  }

  private setDayId(dayId: string): void {
    this.dayId = dayId;

    // Change the active day.
    for (const [id, element] of this.dayElements) {
      element.classList.remove("active", "inactive");
      element.classList.add(id === dayId ? "active" : "inactive");
    }

    // Update the stages and the block schedule.
    this.updateStages();
    this.blockSchedule.updateBlockSchedule(this.dayId, this.enabledStageIds);
    this.updateCurrentTimeLines();

    this.saveState();
  }

  private toggleStageId(stageId: string): void {
    const stageElement = this.stageElements.get(stageId);
    if (!stageElement) {
      throw new Error(
        `No container was created for stage with ID "${stageId}."`,
      );
    }

    const willBeEnabled = !this.enabledStageIds.includes(stageId);
    if (willBeEnabled) {
      this.enabledStageIds.push(stageId);
      stageElement.classList.remove("inactive");
      stageElement.classList.add("active");
    } else {
      this.enabledStageIds = this.enabledStageIds.filter(
        (id) => id !== stageId,
      );
      stageElement.classList.remove("active");
      stageElement.classList.add("inactive");
    }

    // Update the block schedule.
    this.blockSchedule.updateBlockSchedule(this.dayId, this.enabledStageIds);

    this.saveState();
  }

  private saveScrollPosition(): void {
    this.scrollPosition = this.eventsContainer.scrollLeft;
    this.saveState();
  }
}
