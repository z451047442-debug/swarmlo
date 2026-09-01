import { useState, useMemo } from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Search, Download, Filter, MessageSquare } from 'lucide-react';
import { useI18n } from '@/i18n';

interface AgenticFlowEvent {
  type: string;
  timestamp: number;
  data: unknown;
}

interface RealTimeEventLogProps {
  events: AgenticFlowEvent[];
  maxEvents?: number;
}

export function RealTimeEventLog({ events, maxEvents = 100 }: RealTimeEventLogProps) {
  const { t } = useI18n();
  const [searchTerm, setSearchTerm] = useState('');
  const [selectedTypes, setSelectedTypes] = useState<Set<string>>(new Set());

  const filteredEvents = useMemo(() => {
    return events
      .filter(event => {
        if (searchTerm && !JSON.stringify(event).toLowerCase().includes(searchTerm.toLowerCase())) {
          return false;
        }
        if (selectedTypes.size > 0 && !selectedTypes.has(event.type)) {
          return false;
        }
        return true;
      })
      .slice(-maxEvents);
  }, [events, searchTerm, selectedTypes, maxEvents]);

  const eventTypes = useMemo(() => {
    return Array.from(new Set(events.map(e => e.type)));
  }, [events]);

  const handleExport = () => {
    const data = JSON.stringify(filteredEvents, null, 2);
    const blob = new Blob([data], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `events-${Date.now()}.json`;
    a.click();
    // 下载触发后立即释放对象 URL，避免内存泄漏
    URL.revokeObjectURL(url);
  };

  return (
    <Card className="border-2 border-primary/20">
      <CardHeader>
        <div className="flex items-center justify-between">
          <CardTitle className="flex items-center gap-2">
            <MessageSquare className="w-5 h-5 text-green-500" />
            {t('agents.exec.eventLog')}
            <Badge variant="outline">{filteredEvents.length}</Badge>
          </CardTitle>
          <Button size="sm" variant="outline" onClick={handleExport}>
            <Download className="w-4 h-4 mr-1" /> {t('agents.dash.export')}
          </Button>
        </div>
      </CardHeader>
      <CardContent className="space-y-4">
        {/* Search and Filter */}
        <div className="flex gap-2">
          <div className="relative flex-1">
            <Search className="absolute left-3 top-1/2 -translate-y-1/2 w-4 h-4 text-muted-foreground" />
            <Input
              placeholder={t('agents.dash.searchEvents')}
              value={searchTerm}
              onChange={(e) => setSearchTerm(e.target.value)}
              className="pl-9"
            />
          </div>
          <Button variant="outline" size="icon">
            <Filter className="w-4 h-4" />
          </Button>
        </div>

        {/* Event Type Filters */}
        {eventTypes.length > 0 && (
          <div className="flex flex-wrap gap-2">
            {eventTypes.map(type => (
              <Badge
                key={type}
                variant={selectedTypes.has(type) ? 'default' : 'outline'}
                className="cursor-pointer transition-all hover:scale-105"
                onClick={() => {
                  const newTypes = new Set(selectedTypes);
                  if (newTypes.has(type)) {
                    newTypes.delete(type);
                  } else {
                    newTypes.add(type);
                  }
                  setSelectedTypes(newTypes);
                }}
              >
                {type}
              </Badge>
            ))}
          </div>
        )}

        {/* Event List */}
        <ScrollArea className="h-[400px] border rounded-lg">
          <div className="space-y-2 p-3 font-mono text-xs">
            {filteredEvents.length > 0 ? (
              filteredEvents.map((event, index) => (
                <div
                  key={index}
                  className="p-3 rounded-lg border bg-muted/30 hover:bg-muted/50 transition-colors animate-fade-in"
                >
                  <div className="flex items-start justify-between gap-2 mb-1">
                    <Badge variant="outline" className="text-xs">
                      {event.type}
                    </Badge>
                    <span className="text-muted-foreground">
                      {new Date(event.timestamp).toLocaleTimeString()}
                    </span>
                  </div>
                  <pre className="text-xs overflow-x-auto whitespace-pre-wrap">
                    {JSON.stringify(event.data, null, 2)}
                  </pre>
                </div>
              ))
            ) : (
              <div className="text-center text-muted-foreground py-8">
                {events.length === 0 ? t('agents.rtel.noEvents') : t('agents.rtel.noMatch')}
              </div>
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
}
