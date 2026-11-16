import "server-only";
import { MeetingError, type MeetingService } from "./types";

// Local development and tests only (MEETINGS_FAKE=1): no network, predictable links.
// A host address containing "fail" makes every call fail, to exercise retries.
function check(hostEmail: string) {
  if (hostEmail.includes("fail")) throw new MeetingError("Fake service: this host always fails");
}

export function fakeService(label: string, slug: string): MeetingService {
  return {
    label,
    missingConfig: () => null,
    async create(m) {
      check(m.hostEmail);
      return { externalId: `fake-${m.requestId}`, joinUrl: `https://meet.example.com/${slug}/${m.requestId}`, meetingCode: `fake-${m.requestId.slice(0, 8)}` };
    },
    async update(ref) {
      check(ref.hostEmail);
    },
    async remove(ref) {
      check(ref.hostEmail);
    },
    async refresh(ref) {
      check(ref.hostEmail);
      return { externalId: ref.externalId, joinUrl: `https://meet.example.com/${slug}/${ref.externalId.replace(/^fake-/, "")}` };
    },
    async recordings(ref) {
      check(ref.hostEmail);
      return [{ externalId: `${slug}:${ref.externalId}`, url: `https://meet.example.com/${slug}/rec/${ref.externalId}`, passcode: slug === "zoom" ? "fake123" : null, title: `${label} recording` }];
    },
  };
}
