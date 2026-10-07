import { Info } from 'lucide-react';
import { Alert, AlertDescription, AlertTitle } from '@/components/ui/alert';
import { CARD_NOTES, NOTES_TITLE } from '../notes.js';

// Text lives in src/notes.js. lang="si" makes phones pick a Sinhala font.
export default function CardNotes() {
  return <Alert className="border-primary/30 bg-primary/5">
    <Info className="text-primary" />
    <AlertTitle>{NOTES_TITLE.en} <span lang="si" className="font-normal text-muted-foreground">· {NOTES_TITLE.si}</span></AlertTitle>
    <AlertDescription>
      <ul className="mt-1 list-disc space-y-2.5 pl-4">
        {CARD_NOTES.map(note => <li key={note.en}>
          <span className="text-foreground">{note.en}</span>
          <span lang="si" className="block text-muted-foreground">{note.si}</span>
        </li>)}
      </ul>
    </AlertDescription>
  </Alert>;
}
