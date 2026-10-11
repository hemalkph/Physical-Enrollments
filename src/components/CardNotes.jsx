import { ChevronDown, Info } from 'lucide-react';
import { CARD_NOTES, NOTES_TITLE } from '../notes.js';

// Text lives in src/notes.js. lang="si" makes phones pick a Sinhala font.
// Collapsed on phones so the upload box stays near the top; open on wider screens.
const wide = matchMedia('(min-width: 640px)').matches;

export default function CardNotes() {
  return <details open={wide} className="group rounded-lg border border-primary/30 bg-primary/5 px-4 py-3 text-sm">
    <summary className="flex cursor-pointer list-none items-center gap-2 font-medium [&::-webkit-details-marker]:hidden">
      <Info className="size-4 shrink-0 text-primary" />
      <span>{NOTES_TITLE.en} <span lang="si" className="font-normal text-muted-foreground">· {NOTES_TITLE.si}</span></span>
      <span className="ml-auto flex items-center gap-1 text-xs font-normal text-muted-foreground sm:hidden">{CARD_NOTES.length} notes<ChevronDown className="size-4 transition-transform group-open:rotate-180" /></span>
    </summary>
    <ul className="mt-3 list-disc space-y-2.5 pl-4 text-muted-foreground">
      {CARD_NOTES.map(note => <li key={note.en}>
        <span className="text-foreground">{note.en}</span>
        <span lang="si" className="block text-muted-foreground">{note.si}</span>
      </li>)}
    </ul>
  </details>;
}
