/**
 * Back / forward through the places opened (1.24.0-beta.2, the author: Alt+← / Alt+→ in the
 * desktop app, as in a browser). «Історія» keeps a place once, the newest on top — it can't tell
 * where «back» is; this keeps the visits in order, for the session only. A visit to the place
 * that is current changes nothing (a jump back lands there and is recorded again); a new place
 * after going back drops the places ahead, as a browser does.
 */
export interface NavPlace {
  translationId: number;
  bookNumber: number;
  chapter: number;
  verse: number;
  verses?: number[];
  ref: string;
}

const MAX = 100;
const key = (p: NavPlace) => `${p.bookNumber}-${p.chapter}-${(p.verses ?? [p.verse]).join(',')}`;

export function createPlaceNav() {
  let list: NavPlace[] = [];
  let at = -1;
  return {
    visit(p: NavPlace) {
      if (at >= 0 && key(list[at]) === key(p)) return;
      list = [...list.slice(0, at + 1), p].slice(-MAX);
      at = list.length - 1;
    },
    back(): NavPlace | null {
      if (at <= 0) return null;
      at -= 1;
      return list[at];
    },
    forward(): NavPlace | null {
      if (at >= list.length - 1) return null;
      at += 1;
      return list[at];
    },
  };
}

/** The control window's own (one per page). */
export const placeNav = createPlaceNav();
