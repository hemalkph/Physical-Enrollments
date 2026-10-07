import { useState } from 'react';
import { CalendarDays, ChevronLeft, ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Popover, PopoverContent, PopoverTrigger } from '@/components/ui/popover';

const MONTHS = Array.from({ length: 12 }, (_, i) => new Date(2000, i).toLocaleString('en', { month: 'short' }));

// value/onChange use "YYYY-MM", the format the API expects.
export default function MonthPicker({ id, value, onChange, minYear, maxYear, ...rest }) {
  const [open, setOpen] = useState(false);
  const [selYear, selMonth] = value.split('-').map(Number);
  const [year, setYear] = useState(selYear);
  const label = new Date(selYear, selMonth - 1).toLocaleString('en', { month: 'long', year: 'numeric' });

  return <Popover open={open} onOpenChange={next => { setOpen(next); if (next) setYear(selYear); }}>
    <PopoverTrigger asChild>
      <Button id={id} type="button" variant="outline" className="w-full justify-between font-normal dark:bg-input/30" {...rest}>
        {label}<CalendarDays className="text-muted-foreground" />
      </Button>
    </PopoverTrigger>
    <PopoverContent align="start" className="w-72">
      <div className="mb-3 flex items-center justify-between">
        <Button type="button" variant="ghost" size="icon" aria-label="Previous year" disabled={year <= minYear} onClick={() => setYear(year - 1)}><ChevronLeft /></Button>
        <span className="font-semibold" aria-live="polite">{year}</span>
        <Button type="button" variant="ghost" size="icon" aria-label="Next year" disabled={year >= maxYear} onClick={() => setYear(year + 1)}><ChevronRight /></Button>
      </div>
      <div className="grid grid-cols-3 gap-2">
        {MONTHS.map((name, i) => <Button key={name} type="button" size="sm"
          variant={year === selYear && i + 1 === selMonth ? 'default' : 'ghost'}
          onClick={() => { onChange(`${year}-${String(i + 1).padStart(2, '0')}`); setOpen(false); }}>{name}</Button>)}
      </div>
    </PopoverContent>
  </Popover>;
}
