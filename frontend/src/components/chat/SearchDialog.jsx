import { useState, useEffect, useCallback } from 'react';
import { motion, AnimatePresence } from 'framer-motion';
import { Search, X, MessageCircle, Users, Clock } from 'lucide-react';
import { Input } from '../ui/input';
import { Button } from '../ui/button';
import { ScrollArea } from '../ui/scroll-area';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { cn } from '../../lib/utils';
import { useDebounce } from '../../hooks/useDebounce';

export const SearchDialog = ({ isOpen, onClose, api, onSelectConversation, onSelectMessage }) => {
  const [query, setQuery] = useState('');
  const [activeTab, setActiveTab] = useState('messages'); // messages, conversations
  const [messageResults, setMessageResults] = useState([]);
  const [conversationResults, setConversationResults] = useState([]);
  const [loading, setLoading] = useState(false);
  
  const debouncedQuery = useDebounce(query, 300);

  const search = useCallback(async () => {
    if (!debouncedQuery.trim()) {
      setMessageResults([]);
      setConversationResults([]);
      return;
    }

    setLoading(true);
    try {
      const [messagesRes, convsRes] = await Promise.all([
        api.get(`/search/messages?q=${encodeURIComponent(debouncedQuery)}`),
        api.get(`/search/conversations?q=${encodeURIComponent(debouncedQuery)}`)
      ]);
      setMessageResults(messagesRes.data);
      setConversationResults(convsRes.data);
    } catch (error) {
      console.error('Search error:', error);
    } finally {
      setLoading(false);
    }
  }, [debouncedQuery, api]);

  useEffect(() => {
    search();
  }, [search]);

  // Reset on close
  useEffect(() => {
    if (!isOpen) {
      setQuery('');
      setMessageResults([]);
      setConversationResults([]);
    }
  }, [isOpen]);

  const formatDate = (dateString) => {
    const date = new Date(dateString);
    const now = new Date();
    const diff = now - date;
    
    if (diff < 60000) return 'Just now';
    if (diff < 3600000) return `${Math.floor(diff / 60000)}m ago`;
    if (diff < 86400000) return `${Math.floor(diff / 3600000)}h ago`;
    if (diff < 604800000) return `${Math.floor(diff / 86400000)}d ago`;
    return date.toLocaleDateString();
  };

  const highlightMatch = (text, query) => {
    if (!query || !text) return text;
    const parts = text.split(new RegExp(`(${query})`, 'gi'));
    return parts.map((part, i) => 
      part.toLowerCase() === query.toLowerCase() 
        ? <mark key={i} className="bg-primary/30 text-inherit">{part}</mark>
        : part
    );
  };

  if (!isOpen) return null;

  return (
    <AnimatePresence>
      <motion.div
        initial={{ opacity: 0 }}
        animate={{ opacity: 1 }}
        exit={{ opacity: 0 }}
        className="fixed inset-0 z-50 bg-black/50 flex items-start justify-center pt-20 px-4"
        onClick={onClose}
      >
        <motion.div
          initial={{ opacity: 0, y: -20, scale: 0.95 }}
          animate={{ opacity: 1, y: 0, scale: 1 }}
          exit={{ opacity: 0, y: -20, scale: 0.95 }}
          className="w-full max-w-2xl bg-card rounded-2xl shadow-2xl overflow-hidden"
          onClick={(e) => e.stopPropagation()}
          data-testid="search-dialog"
        >
          {/* Search input */}
          <div className="p-4 border-b border-border">
            <div className="relative">
              <Search className="absolute left-4 top-1/2 -translate-y-1/2 w-5 h-5 text-muted-foreground" />
              <Input
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder="Search messages and conversations..."
                className="pl-12 pr-12 py-6 text-lg rounded-xl"
                autoFocus
                data-testid="search-input"
              />
              {query && (
                <Button
                  variant="ghost"
                  size="icon"
                  className="absolute right-2 top-1/2 -translate-y-1/2"
                  onClick={() => setQuery('')}
                >
                  <X className="w-4 h-4" />
                </Button>
              )}
            </div>
          </div>

          {/* Tabs */}
          <div className="flex border-b border-border">
            <button
              onClick={() => setActiveTab('messages')}
              className={cn(
                "flex-1 py-3 text-sm font-medium transition-colors",
                activeTab === 'messages' 
                  ? "text-primary border-b-2 border-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <MessageCircle className="w-4 h-4 inline mr-2" />
              Messages ({messageResults.length})
            </button>
            <button
              onClick={() => setActiveTab('conversations')}
              className={cn(
                "flex-1 py-3 text-sm font-medium transition-colors",
                activeTab === 'conversations' 
                  ? "text-primary border-b-2 border-primary" 
                  : "text-muted-foreground hover:text-foreground"
              )}
            >
              <Users className="w-4 h-4 inline mr-2" />
              Conversations ({conversationResults.length})
            </button>
          </div>

          {/* Results */}
          <ScrollArea className="h-96">
            {loading ? (
              <div className="flex items-center justify-center h-32">
                <div className="animate-spin w-6 h-6 border-2 border-primary border-t-transparent rounded-full" />
              </div>
            ) : (
              <div className="p-2">
                {activeTab === 'messages' && (
                  <>
                    {messageResults.length > 0 ? (
                      messageResults.map((msg) => (
                        <motion.div
                          key={msg.message_id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          onClick={() => {
                            onSelectMessage?.(msg);
                            onClose();
                          }}
                          className="p-3 rounded-xl hover:bg-muted cursor-pointer transition-colors"
                        >
                          <div className="flex items-start gap-3">
                            <Avatar className="w-10 h-10">
                              <AvatarFallback className="bg-primary/20">
                                {msg.sender_name?.[0]?.toUpperCase()}
                              </AvatarFallback>
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <div className="flex items-center gap-2">
                                <span className="font-medium">{msg.sender_name}</span>
                                <span className="text-xs text-muted-foreground flex items-center gap-1">
                                  <Clock className="w-3 h-3" />
                                  {formatDate(msg.created_at)}
                                </span>
                              </div>
                              <p className="text-sm text-muted-foreground truncate mt-1">
                                {highlightMatch(msg.content, query)}
                              </p>
                              <p className="text-lg mt-1">{msg.emoji_content}</p>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    ) : query && (
                      <div className="text-center py-12 text-muted-foreground">
                        <MessageCircle className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No messages found</p>
                      </div>
                    )}
                  </>
                )}

                {activeTab === 'conversations' && (
                  <>
                    {conversationResults.length > 0 ? (
                      conversationResults.map((conv) => (
                        <motion.div
                          key={conv.conversation_id}
                          initial={{ opacity: 0 }}
                          animate={{ opacity: 1 }}
                          onClick={() => {
                            onSelectConversation?.(conv.conversation_id);
                            onClose();
                          }}
                          className="p-3 rounded-xl hover:bg-muted cursor-pointer transition-colors"
                        >
                          <div className="flex items-center gap-3">
                            <Avatar className="w-12 h-12">
                              {conv.is_group ? (
                                <AvatarFallback className="bg-secondary text-secondary-foreground">
                                  <Users className="w-5 h-5" />
                                </AvatarFallback>
                              ) : (
                                <AvatarFallback className="bg-accent text-accent-foreground">
                                  {conv.participants?.[0]?.name?.[0]?.toUpperCase()}
                                </AvatarFallback>
                              )}
                            </Avatar>
                            <div className="flex-1 min-w-0">
                              <p className="font-medium">
                                {highlightMatch(
                                  conv.name || conv.participants?.map(p => p.name).join(', '),
                                  query
                                )}
                              </p>
                              <p className="text-sm text-muted-foreground">
                                {conv.is_group ? 'Group chat' : 'Direct message'}
                                {conv.participants && ` • ${conv.participants.length} members`}
                              </p>
                            </div>
                          </div>
                        </motion.div>
                      ))
                    ) : query && (
                      <div className="text-center py-12 text-muted-foreground">
                        <Users className="w-12 h-12 mx-auto mb-3 opacity-50" />
                        <p>No conversations found</p>
                      </div>
                    )}
                  </>
                )}

                {!query && (
                  <div className="text-center py-12 text-muted-foreground">
                    <Search className="w-12 h-12 mx-auto mb-3 opacity-50" />
                    <p>Type to search messages and conversations</p>
                  </div>
                )}
              </div>
            )}
          </ScrollArea>

          {/* Keyboard hint */}
          <div className="p-3 border-t border-border text-center text-xs text-muted-foreground">
            Press <kbd className="px-1.5 py-0.5 bg-muted rounded">ESC</kbd> to close
          </div>
        </motion.div>
      </motion.div>
    </AnimatePresence>
  );
};
