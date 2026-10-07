import { useState } from 'react';
import { UploadCloud, X } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { cn } from '@/lib/utils';
import { IMAGE_TYPES } from '../upload.js';

export default function PhotoDropzone({ photo, preview, onFile, onClear }) {
  const [dragging, setDragging] = useState(false);

  if (photo) return <div className="flex items-center gap-3 rounded-lg border border-border bg-input/20 p-3">
    <img src={preview} alt="Preview of your monthly physical card" className="size-20 rounded-md object-cover" />
    <div className="min-w-0 flex-1">
      <p className="truncate text-sm font-medium">{photo.name}</p>
      <p className="text-xs text-muted-foreground">{(photo.size / 1048576).toFixed(2)} MB</p>
    </div>
    <Button type="button" variant="ghost" size="icon" aria-label="Remove photo" onClick={onClear}><X /></Button>
  </div>;

  return <label htmlFor="image"
    onDragOver={event => { event.preventDefault(); setDragging(true); }}
    onDragLeave={() => setDragging(false)}
    onDrop={event => { event.preventDefault(); setDragging(false); onFile(event.dataTransfer.files[0]); }}
    className={cn('flex cursor-pointer flex-col items-center gap-2 rounded-lg border-2 border-dashed border-input px-4 py-8 text-center transition-colors hover:border-primary/60 focus-within:border-ring focus-within:ring-[3px] focus-within:ring-ring/50',
      dragging && 'border-primary bg-primary/10')}>
    <UploadCloud className="size-8 text-primary" />
    <span className="text-sm font-medium">Tap to choose a photo <span className="font-normal text-muted-foreground">or drag it here</span></span>
    <input id="image" type="file" accept={IMAGE_TYPES.join(',')} className="sr-only" aria-describedby="image-help"
      onChange={event => { const file = event.target.files[0]; event.target.value = ''; onFile(file); }} />
  </label>;
}
