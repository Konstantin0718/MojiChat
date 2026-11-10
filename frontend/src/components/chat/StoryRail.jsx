import { useCallback, useEffect, useState } from 'react';
import { Plus, X } from 'lucide-react';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { Button } from '../ui/button';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '../ui/dialog';
import { cn } from '../../lib/utils';
import { toast } from 'sonner';

const STORY_COLORS = ['#8B5CF6', '#EC4899', '#F59E0B', '#10B981', '#3B82F6', '#EF4444'];
const API_URL = process.env.REACT_APP_BACKEND_URL || '';

function groupStories(items, currentUserId) {
  const map = new Map();
  items.forEach((status) => {
    const list = map.get(status.user_id) || [];
    list.push(status);
    map.set(status.user_id, list);
  });
  return Array.from(map.values()).map((statuses) => {
    const ordered = [...statuses].sort((a, b) => (a.created_at || '').localeCompare(b.created_at || ''));
    const first = ordered[0];
    return {
      userId: first.user_id,
      name: first.user_name || 'Story',
      picture: first.user_picture,
      statuses: ordered,
      unseen: ordered.some((status) => !(status.viewed_by || []).includes(currentUserId)),
    };
  });
}

export const StoryRail = ({ api, currentUser }) => {
  const [mine, setMine] = useState([]);
  const [others, setOthers] = useState([]);
  const [composerOpen, setComposerOpen] = useState(false);
  const [text, setText] = useState('');
  const [color, setColor] = useState(STORY_COLORS[0]);
  const [posting, setPosting] = useState(false);
  const [viewer, setViewer] = useState(null);

  const load = useCallback(async () => {
    if (!api) return;
    try {
      const res = await api.get('/statuses');
      const data = res.data || {};
      setMine(data.my_statuses || []);
      setOthers(groupStories([...(data.recent || []), ...(data.viewed || [])], currentUser?.user_id));
    } catch (error) {
      console.error('Could not load stories', error);
    }
  }, [api, currentUser?.user_id]);

  useEffect(() => {
    load();
  }, [load]);

  const markViewed = useCallback(async (status) => {
    if (!status || status.user_id === currentUser?.user_id) return;
    if ((status.viewed_by || []).includes(currentUser?.user_id)) return;
    try {
      await api.post(`/statuses/${status.status_id}/view`);
      setOthers((prev) => prev.map((group) => ({
        ...group,
        statuses: group.statuses.map((item) => (
          item.status_id === status.status_id
            ? { ...item, viewed_by: [...(item.viewed_by || []), currentUser?.user_id] }
            : item
        )),
        unseen: group.statuses.some((item) => {
          const viewed = item.status_id === status.status_id
            ? [...(item.viewed_by || []), currentUser?.user_id]
            : (item.viewed_by || []);
          return !viewed.includes(currentUser?.user_id);
        }),
      })));
    } catch (error) {
      console.error('Could not record story view', error);
    }
  }, [api, currentUser?.user_id]);

  useEffect(() => {
    if (!viewer) return undefined;
    const current = viewer.statuses[viewer.index];
    markViewed(current);
    const timer = setTimeout(() => {
      setViewer((prev) => {
        if (!prev) return null;
        if (prev.index + 1 < prev.statuses.length) {
          return { ...prev, index: prev.index + 1 };
        }
        return null;
      });
    }, 5000);
    return () => clearTimeout(timer);
  }, [viewer, markViewed]);

  const postText = async () => {
    if (!text.trim()) {
      toast.error('Write something for your story');
      return;
    }
    setPosting(true);
    try {
      await api.post('/statuses', {
        content_type: 'text',
        text_content: text.trim(),
        background_color: color,
      });
      setText('');
      setComposerOpen(false);
      toast.success('Story posted');
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Could not post story');
    } finally {
      setPosting(false);
    }
  };

  const postImage = async (file) => {
    if (!file) return;
    setPosting(true);
    try {
      const formData = new FormData();
      formData.append('file', file);
      const upload = await api.post('/upload', formData, {
        headers: { 'Content-Type': 'multipart/form-data' },
      });
      await api.post('/statuses', {
        content_type: 'image',
        file_url: upload.data.file_url,
      });
      setComposerOpen(false);
      toast.success('Story posted');
      await load();
    } catch (error) {
      toast.error(error?.response?.data?.detail || 'Could not post story');
    } finally {
      setPosting(false);
    }
  };

  const openMine = () => {
    if (mine.length === 0) {
      setComposerOpen(true);
      return;
    }
    setViewer({
      name: 'Your story',
      statuses: mine,
      index: 0,
    });
  };

  const currentStatus = viewer?.statuses?.[viewer.index];

  return (
    <div className="px-3 pt-3" data-testid="story-rail">
      <div className="flex gap-3 overflow-x-auto pb-2">
        <button type="button" onClick={openMine} className="flex flex-col items-center gap-1 shrink-0 w-16" data-testid="my-story-btn">
          <span className={cn('rounded-full p-0.5', mine.length ? 'bg-primary' : 'bg-muted')}>
            <Avatar className="w-12 h-12 border-2 border-card">
              <AvatarImage src={currentUser?.picture} />
              <AvatarFallback>{currentUser?.name?.[0]?.toUpperCase() || 'Y'}</AvatarFallback>
            </Avatar>
          </span>
          <span className="text-[11px] text-muted-foreground">Your story</span>
        </button>
        <button
          type="button"
          onClick={() => setComposerOpen(true)}
          className="flex flex-col items-center gap-1 shrink-0 w-16"
          data-testid="create-story-btn"
        >
          <span className="w-12 h-12 rounded-full border border-dashed border-primary text-primary flex items-center justify-center">
            <Plus className="w-5 h-5" />
          </span>
          <span className="text-[11px] text-muted-foreground">Add</span>
        </button>
        {others.map((group) => (
          <button
            key={group.userId}
            type="button"
            onClick={() => setViewer({ name: group.name, statuses: group.statuses, index: 0 })}
            className="flex flex-col items-center gap-1 shrink-0 w-16"
            data-testid={`story-${group.userId}`}
          >
            <span className={cn('rounded-full p-0.5', group.unseen ? 'bg-primary' : 'bg-muted-foreground/40')}>
              <Avatar className="w-12 h-12 border-2 border-card">
                <AvatarImage src={group.picture} />
                <AvatarFallback>{group.name?.[0]?.toUpperCase()}</AvatarFallback>
              </Avatar>
            </span>
            <span className="text-[11px] truncate w-full text-center">{group.name}</span>
          </button>
        ))}
      </div>

      <Dialog open={composerOpen} onOpenChange={setComposerOpen}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="font-heading">New story</DialogTitle>
          </DialogHeader>
          <div
            className="rounded-xl min-h-40 flex items-center justify-center p-4 text-white text-center"
            style={{ backgroundColor: color }}
          >
            {text || 'Your story text'}
          </div>
          <textarea
            value={text}
            onChange={(event) => setText(event.target.value)}
            placeholder="Type a status..."
            className="w-full min-h-20 rounded-lg border border-border bg-background p-3 text-sm"
            data-testid="story-text-input"
          />
          <div className="flex gap-2">
            {STORY_COLORS.map((swatch) => (
              <button
                key={swatch}
                type="button"
                aria-label={`Story color ${swatch}`}
                onClick={() => setColor(swatch)}
                className={cn('w-7 h-7 rounded-full border-2', color === swatch ? 'border-foreground' : 'border-transparent')}
                style={{ backgroundColor: swatch }}
              />
            ))}
          </div>
          <div className="flex gap-2">
            <Button onClick={postText} disabled={posting} className="flex-1" data-testid="post-story-btn">
              {posting ? 'Posting...' : 'Post text'}
            </Button>
            <label className="flex-1">
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => postImage(event.target.files?.[0])}
              />
              <span className="inline-flex w-full h-10 items-center justify-center rounded-md border border-border text-sm cursor-pointer">
                Photo
              </span>
            </label>
          </div>
        </DialogContent>
      </Dialog>

      {viewer && currentStatus && (
        <div className="fixed inset-0 z-50 bg-black text-white flex flex-col" data-testid="story-viewer">
          <div className="flex gap-1 p-3">
            {viewer.statuses.map((status, index) => (
              <div key={status.status_id} className="h-1 flex-1 bg-white/30 rounded-full overflow-hidden">
                <div className={cn('h-full bg-white', index <= viewer.index ? 'w-full' : 'w-0')} />
              </div>
            ))}
          </div>
          <div className="flex items-center justify-between px-4">
            <p className="font-medium">{viewer.name}</p>
            <button type="button" onClick={() => setViewer(null)} aria-label="Close story">
              <X className="w-6 h-6" />
            </button>
          </div>
          <div className="relative flex-1 flex items-center justify-center px-6">
            <button
              type="button"
              className="absolute left-0 top-0 bottom-0 w-1/3"
              aria-label="Previous story"
              onClick={() => setViewer((prev) => (prev && prev.index > 0 ? { ...prev, index: prev.index - 1 } : prev))}
            />
            <button
              type="button"
              className="absolute right-0 top-0 bottom-0 w-1/3"
              aria-label="Next story"
              onClick={() => setViewer((prev) => {
                if (!prev) return null;
                if (prev.index + 1 < prev.statuses.length) return { ...prev, index: prev.index + 1 };
                return null;
              })}
            />
            {currentStatus.content_type === 'image' && currentStatus.content_url ? (
              <img
                src={currentStatus.content_url.startsWith('http') ? currentStatus.content_url : `${API_URL}${currentStatus.content_url}`}
                alt="Story"
                className="max-h-[80vh] max-w-full object-contain"
              />
            ) : (
              <div
                className="w-full max-w-md min-h-64 rounded-2xl flex items-center justify-center p-8 text-2xl text-center"
                style={{ backgroundColor: currentStatus.background_color || '#8B5CF6' }}
              >
                {currentStatus.text_content}
              </div>
            )}
          </div>
        </div>
      )}
    </div>
  );
};
