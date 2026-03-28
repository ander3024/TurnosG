// ─── Rotation Logic ───────────────────────────────────────
import type { EnginePerson } from "./types";

/**
 * Determine who is OFF for a given week.
 * Formula: (weekNumber + person.offset) % 4 === 3
 * With 4 people (offsets 0,1,2,3), exactly one is OFF each week.
 */
export function getOffPerson(
  weekNumber: number,
  people: EnginePerson[]
): EnginePerson | null {
  for (const p of people) {
    if ((weekNumber + (p.offset || 0)) % 4 === 3) {
      return p;
    }
  }
  // Fallback: round-robin
  return people[weekNumber % people.length] || null;
}

/**
 * The weekend worker is the person who will be OFF NEXT week.
 * They work Sat+Sun, then get the following week off.
 */
export function getWeekendWorker(
  weekNumber: number,
  people: EnginePerson[]
): EnginePerson | null {
  return getOffPerson(weekNumber + 1, people);
}

/**
 * Get the 2 weekday workers for a given week.
 * These are the people who are NOT off this week AND NOT the weekend worker.
 */
export function getWeekdayWorkers(
  weekNumber: number,
  people: EnginePerson[]
): EnginePerson[] {
  const offPerson = getOffPerson(weekNumber, people);
  const weekendPerson = getWeekendWorker(weekNumber, people);

  return people.filter(
    (p) => p.id !== offPerson?.id && p.id !== weekendPerson?.id
  );
}

/**
 * Get ALL working people for a week (3 out of 4).
 * = everyone except the OFF person.
 */
export function getWorkingPeople(
  weekNumber: number,
  people: EnginePerson[]
): EnginePerson[] {
  const offPerson = getOffPerson(weekNumber, people);
  return people.filter((p) => p.id !== offPerson?.id);
}
