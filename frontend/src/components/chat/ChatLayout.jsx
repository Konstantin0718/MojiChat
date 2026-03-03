import { useState, useEffect, useRef, useCallback } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  Search, 
  Plus, 
  Users, 
  MessageCircle, 
  Settings, 
  LogOut,
  Menu,
  X,
  UserPlus,
  ChevronLeft
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ThemeToggle } from '../ui/ThemeToggle';
import { EmojiRevealCard } from './EmojiRevealCard';
import { TypingIndicator } from './TypingIndicator';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { ScrollArea } from '../ui/scroll-area';
import { Sheet, SheetContent, SheetTrigger } from '../ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { cn } from '../../lib/utils';
import { Toaster, toast } from 'sonner';

export const ChatLayout = () => {
  const { user, logout, api } = useAuth();
  const navigate = useNavigate();
  const { conversationId } = useParams();
  
  const [conversations, setConversations] = useState([]);
  const [currentConversation, setCurrentConversation] = useState(null);
  const [messages, setMessages] = useState([]);
  const [newMessage, setNewMessage] = useState('');
  const [typingUsers, setTypingUsers] = useState([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [searchResults, setSearchResults] = useState([]);
  const [isSidebarOpen, setIsSidebarOpen] = useState(false);
  const [isNewChatOpen, setIsNewChatOpen] = useState(false);
  const [isNewGroupOpen, setIsNewGroupOpen] = useState(false);
  const [groupName, setGroupName] = useState('');
  const [selectedUsers, setSelectedUsers] = useState([]);
  const [sending, setSending] = useState(false);
  
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);

  // Fetch conversations
  const fetchConversations = useCallback(async () => {
    try {
      const response = await api.get('/conversations');
      setConversations(response.data);
    } catch (error) {
      console.error('Error fetching conversations:', error);
    }
  }, [api]);

  // Fetch messages for current conversation
  const fetchMessages = useCallback(async () => {
    if (!conversationId) return;
    try {
      const response = await api.get(`/conversations/${conversationId}/messages`);
      setMessages(response.data);
    } catch (error) {
      console.error('Error fetching messages:', error);
    }
  }, [api, conversationId]);

  // Fetch conversation details
  const fetchConversationDetails = useCallback(async () => {
    if (!conversationId) return;
    try {
      const response = await api.get(`/conversations/${conversationId}`);
      setCurrentConversation(response.data);
    } catch (error) {
      console.error('Error fetching conversation:', error);
    }
  }, [api, conversationId]);

  // Fetch typing status
  const fetchTypingStatus = useCallback(async () => {
    if (!conversationId) return;
    try {
      const response = await api.get(`/conversations/${conversationId}/typing`);
      setTypingUsers(response.data);
    } catch (error) {
      // Ignore typing errors
    }
  }, [api, conversationId]);

  // Initial load
  useEffect(() => {
    fetchConversations();
  }, [fetchConversations]);

  // Load conversation data when conversationId changes
  useEffect(() => {
    if (conversationId) {
      fetchConversationDetails();
      fetchMessages();
    } else {
      setCurrentConversation(null);
      setMessages([]);
    }
  }, [conversationId, fetchConversationDetails, fetchMessages]);

  // Polling for new messages and typing status
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations();
      if (conversationId) {
        fetchMessages();
        fetchTypingStatus();
      }
    }, 2000);
    return () => clearInterval(interval);
  }, [conversationId, fetchConversations, fetchMessages, fetchTypingStatus]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Search users
  const searchUsers = async (query) => {
    if (!query.trim()) {
      setSearchResults([]);
      return;
    }
    try {
      const response = await api.get(`/users/search?q=${encodeURIComponent(query)}`);
      setSearchResults(response.data);
    } catch (error) {
      console.error('Error searching users:', error);
    }
  };

  // Handle typing indicator
  const handleTyping = async () => {
    if (!conversationId) return;
    try {
      await api.post(`/conversations/${conversationId}/typing`, { is_typing: true });
    } catch (e) {
      // Ignore
    }

    if (typingTimeoutRef.current) {
      clearTimeout(typingTimeoutRef.current);
    }

    typingTimeoutRef.current = setTimeout(async () => {
      try {
        await api.post(`/conversations/${conversationId}/typing`, { is_typing: false });
      } catch (e) {
        // Ignore
      }
    }, 3000);
  };

  // Send message
  const sendMessage = async (e) => {
    e.preventDefault();
    if (!newMessage.trim() || !conversationId || sending) return;

    setSending(true);
    try {
      await api.post(`/conversations/${conversationId}/messages`, {
        content: newMessage.trim()
      });
      setNewMessage('');
      await fetchMessages();
      inputRef.current?.focus();
    } catch (error) {
      toast.error('Failed to send message');
    } finally {
      setSending(false);
    }
  };

  // Start new conversation
  const startConversation = async (userId) => {
    try {
      const response = await api.post('/conversations', {
        participant_ids: [userId],
        is_group: false
      });
      setIsNewChatOpen(false);
      setSearchQuery('');
      setSearchResults([]);
      navigate(`/chat/${response.data.conversation_id}`);
      toast.success('Chat started!');
    } catch (error) {
      toast.error('Failed to start conversation');
    }
  };

  // Create group chat
  const createGroup = async () => {
    if (!groupName.trim() || selectedUsers.length < 1) {
      toast.error('Please enter a group name and select at least one member');
      return;
    }
    try {
      const response = await api.post('/conversations', {
        participant_ids: selectedUsers.map(u => u.user_id),
        name: groupName,
        is_group: true
      });
      setIsNewGroupOpen(false);
      setGroupName('');
      setSelectedUsers([]);
      setSearchQuery('');
      setSearchResults([]);
      navigate(`/chat/${response.data.conversation_id}`);
      toast.success('Group created!');
    } catch (error) {
      toast.error('Failed to create group');
    }
  };

  // Get conversation display name
  const getConversationName = (conv) => {
    if (conv.name) return conv.name;
    const otherParticipants = conv.participants?.filter(p => p.user_id !== user?.user_id) || [];
    return otherParticipants.map(p => p.name).join(', ') || 'Chat';
  };

  // Get other participant for avatar
  const getOtherParticipant = (conv) => {
    return conv.participants?.find(p => p.user_id !== user?.user_id);
  };

  const handleLogout = async () => {
    await logout();
    navigate('/');
  };

  // Sidebar content
  const SidebarContent = () => (
    <div className="flex flex-col h-full bg-card">
      {/* Header */}
      <div className="p-4 border-b border-border">
        <div className="flex items-center justify-between mb-4">
          <h1 className="text-2xl font-heading font-bold gradient-brand bg-clip-text text-transparent">
            MojiChat
          </h1>
          <ThemeToggle />
        </div>
        
        {/* User info */}
        <div className="flex items-center gap-3">
          <Avatar className="w-10 h-10 border-2 border-primary">
            <AvatarImage src={user?.picture} />
            <AvatarFallback className="bg-primary text-primary-foreground font-bold">
              {user?.name?.[0]?.toUpperCase()}
            </AvatarFallback>
          </Avatar>
          <div className="flex-1 min-w-0">
            <p className="font-medium truncate">{user?.name}</p>
            <p className="text-xs text-muted-foreground truncate">{user?.email}</p>
          </div>
        </div>
      </div>

      {/* Action buttons */}
      <div className="p-3 flex gap-2">
        <Dialog open={isNewChatOpen} onOpenChange={setIsNewChatOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 gap-2"
              data-testid="new-chat-btn"
            >
              <MessageCircle className="w-4 h-4" />
              New Chat
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-heading">Start New Chat</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Search users by name or email..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  searchUsers(e.target.value);
                }}
                data-testid="user-search-input"
              />
              <ScrollArea className="h-64">
                {searchResults.map((u) => (
                  <div
                    key={u.user_id}
                    onClick={() => startConversation(u.user_id)}
                    className="flex items-center gap-3 p-3 rounded-lg hover:bg-muted cursor-pointer transition-colors"
                    data-testid={`user-result-${u.user_id}`}
                  >
                    <Avatar>
                      <AvatarImage src={u.picture} />
                      <AvatarFallback className="bg-secondary text-secondary-foreground">
                        {u.name?.[0]?.toUpperCase()}
                      </AvatarFallback>
                    </Avatar>
                    <div>
                      <p className="font-medium">{u.name}</p>
                      <p className="text-xs text-muted-foreground">{u.email}</p>
                    </div>
                    {u.is_online && (
                      <div className="ml-auto w-2 h-2 rounded-full bg-green-500" />
                    )}
                  </div>
                ))}
                {searchQuery && searchResults.length === 0 && (
                  <p className="text-center text-muted-foreground py-8">No users found</p>
                )}
              </ScrollArea>
            </div>
          </DialogContent>
        </Dialog>

        <Dialog open={isNewGroupOpen} onOpenChange={setIsNewGroupOpen}>
          <DialogTrigger asChild>
            <Button 
              variant="outline" 
              size="sm" 
              className="flex-1 gap-2"
              data-testid="new-group-btn"
            >
              <Users className="w-4 h-4" />
              New Group
            </Button>
          </DialogTrigger>
          <DialogContent>
            <DialogHeader>
              <DialogTitle className="font-heading">Create Group Chat</DialogTitle>
            </DialogHeader>
            <div className="space-y-4">
              <Input
                placeholder="Group name..."
                value={groupName}
                onChange={(e) => setGroupName(e.target.value)}
                data-testid="group-name-input"
              />
              <Input
                placeholder="Search users to add..."
                value={searchQuery}
                onChange={(e) => {
                  setSearchQuery(e.target.value);
                  searchUsers(e.target.value);
                }}
              />
              {selectedUsers.length > 0 && (
                <div className="flex flex-wrap gap-2">
                  {selectedUsers.map((u) => (
                    <div
                      key={u.user_id}
                      className="flex items-center gap-1 bg-primary/10 text-primary rounded-full px-3 py-1 text-sm"
                    >
                      {u.name}
                      <X
                        className="w-3 h-3 cursor-pointer"
                        onClick={() => setSelectedUsers(selectedUsers.filter(s => s.user_id !== u.user_id))}
                      />
                    </div>
                  ))}
                </div>
              )}
              <ScrollArea className="h-48">
                {searchResults
                  .filter(u => !selectedUsers.find(s => s.user_id === u.user_id))
                  .map((u) => (
                    <div
                      key={u.user_id}
                      onClick={() => setSelectedUsers([...selectedUsers, u])}
                      className="flex items-center gap-3 p-2 rounded-lg hover:bg-muted cursor-pointer transition-colors"
                    >
                      <Avatar className="w-8 h-8">
                        <AvatarImage src={u.picture} />
                        <AvatarFallback>{u.name?.[0]?.toUpperCase()}</AvatarFallback>
                      </Avatar>
                      <span className="text-sm">{u.name}</span>
                      <UserPlus className="w-4 h-4 ml-auto text-muted-foreground" />
                    </div>
                  ))}
              </ScrollArea>
              <Button onClick={createGroup} className="w-full" data-testid="create-group-btn">
                Create Group
              </Button>
            </div>
          </DialogContent>
        </Dialog>
      </div>

      {/* Conversations list */}
      <ScrollArea className="flex-1">
        <div className="p-2 space-y-1">
          {conversations.map((conv) => {
            const otherParticipant = getOtherParticipant(conv);
            const isActive = conv.conversation_id === conversationId;
            
            return (
              <motion.div
                key={conv.conversation_id}
                whileHover={{ scale: 1.02 }}
                whileTap={{ scale: 0.98 }}
                onClick={() => {
                  navigate(`/chat/${conv.conversation_id}`);
                  setIsSidebarOpen(false);
                }}
                className={cn(
                  "flex items-center gap-3 p-3 rounded-2xl cursor-pointer transition-colors",
                  isActive ? "bg-primary/10 border border-primary/20" : "hover:bg-muted"
                )}
                data-testid={`conversation-${conv.conversation_id}`}
              >
                <div className="relative">
                  <Avatar>
                    {conv.is_group ? (
                      <AvatarFallback className="bg-secondary text-secondary-foreground">
                        <Users className="w-5 h-5" />
                      </AvatarFallback>
                    ) : (
                      <>
                        <AvatarImage src={otherParticipant?.picture} />
                        <AvatarFallback className="bg-accent text-accent-foreground">
                          {otherParticipant?.name?.[0]?.toUpperCase()}
                        </AvatarFallback>
                      </>
                    )}
                  </Avatar>
                  {!conv.is_group && otherParticipant?.is_online && (
                    <div className="absolute bottom-0 right-0 w-3 h-3 bg-green-500 rounded-full border-2 border-card" />
                  )}
                </div>
                <div className="flex-1 min-w-0">
                  <div className="flex items-center justify-between">
                    <p className="font-medium truncate">{getConversationName(conv)}</p>
                    {conv.last_message && (
                      <span className="text-xs text-muted-foreground">
                        {new Date(conv.last_message.created_at).toLocaleTimeString('en-US', {
                          hour: '2-digit',
                          minute: '2-digit',
                          hour12: false
                        })}
                      </span>
                    )}
                  </div>
                  {conv.last_message && (
                    <p className="text-sm text-muted-foreground truncate">
                      {conv.last_message.emoji_content?.slice(0, 20) || '🔮'}
                    </p>
                  )}
                </div>
                {conv.unread_count > 0 && (
                  <div className="w-5 h-5 bg-primary text-primary-foreground rounded-full flex items-center justify-center text-xs font-bold">
                    {conv.unread_count}
                  </div>
                )}
              </motion.div>
            );
          })}
          {conversations.length === 0 && (
            <div className="text-center py-12 text-muted-foreground">
              <MessageCircle className="w-12 h-12 mx-auto mb-4 opacity-50" />
              <p>No conversations yet</p>
              <p className="text-sm">Start a new chat!</p>
            </div>
          )}
        </div>
      </ScrollArea>

      {/* Footer */}
      <div className="p-3 border-t border-border">
        <Button
          variant="ghost"
          className="w-full justify-start gap-2 text-destructive hover:text-destructive hover:bg-destructive/10"
          onClick={handleLogout}
          data-testid="logout-btn"
        >
          <LogOut className="w-4 h-4" />
          Logout
        </Button>
      </div>
    </div>
  );

  return (
    <div className="flex h-screen bg-background" data-testid="chat-layout">
      <Toaster position="top-center" richColors />
      
      {/* Desktop Sidebar */}
      <div className="hidden md:block w-80 border-r border-border">
        <SidebarContent />
      </div>

      {/* Mobile Sidebar */}
      <Sheet open={isSidebarOpen} onOpenChange={setIsSidebarOpen}>
        <SheetContent side="left" className="p-0 w-80">
          <SidebarContent />
        </SheetContent>
      </Sheet>

      {/* Main Chat Area */}
      <div className="flex-1 flex flex-col min-w-0">
        {/* Chat Header */}
        <div className="h-16 px-4 flex items-center gap-3 border-b border-border bg-card">
          <Button
            variant="ghost"
            size="icon"
            className="md:hidden"
            onClick={() => setIsSidebarOpen(true)}
            data-testid="mobile-menu-btn"
          >
            <Menu className="w-5 h-5" />
          </Button>

          {currentConversation ? (
            <>
              <Avatar>
                {currentConversation.is_group ? (
                  <AvatarFallback className="bg-secondary text-secondary-foreground">
                    <Users className="w-5 h-5" />
                  </AvatarFallback>
                ) : (
                  <>
                    <AvatarImage src={getOtherParticipant(currentConversation)?.picture} />
                    <AvatarFallback className="bg-accent text-accent-foreground">
                      {getOtherParticipant(currentConversation)?.name?.[0]?.toUpperCase()}
                    </AvatarFallback>
                  </>
                )}
              </Avatar>
              <div className="flex-1 min-w-0">
                <p className="font-medium truncate">{getConversationName(currentConversation)}</p>
                {!currentConversation.is_group && getOtherParticipant(currentConversation)?.is_online && (
                  <p className="text-xs text-green-500">Online</p>
                )}
                {currentConversation.is_group && (
                  <p className="text-xs text-muted-foreground">
                    {currentConversation.participants?.length} members
                  </p>
                )}
              </div>
            </>
          ) : (
            <div className="flex-1">
              <p className="font-medium text-muted-foreground">Select a chat</p>
            </div>
          )}
        </div>

        {/* Messages Area */}
        {currentConversation ? (
          <>
            <ScrollArea className="flex-1 p-4">
              <div className="space-y-4 max-w-3xl mx-auto">
                <AnimatePresence>
                  {messages.map((msg) => (
                    <EmojiRevealCard
                      key={msg.message_id}
                      message={msg}
                      isOwn={msg.sender_id === user?.user_id}
                      currentUserId={user?.user_id}
                    />
                  ))}
                </AnimatePresence>
                
                {typingUsers.length > 0 && (
                  <TypingIndicator userName={typingUsers[0]?.user_name} />
                )}
                
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* Message Input */}
            <div className="p-4 border-t border-border bg-card">
              <form onSubmit={sendMessage} className="flex gap-3 max-w-3xl mx-auto">
                <Input
                  ref={inputRef}
                  value={newMessage}
                  onChange={(e) => {
                    setNewMessage(e.target.value);
                    handleTyping();
                  }}
                  placeholder="Type a message... (will be converted to emojis!)"
                  className="flex-1 rounded-full bg-muted border-none focus:ring-2 focus:ring-primary/50 px-6"
                  data-testid="message-input"
                />
                <Button
                  type="submit"
                  size="icon"
                  disabled={!newMessage.trim() || sending}
                  className="rounded-full w-12 h-12 shadow-neon"
                  data-testid="send-message-btn"
                >
                  <Send className="w-5 h-5" />
                </Button>
              </form>
            </div>
          </>
        ) : (
          <div className="flex-1 flex items-center justify-center">
            <div className="text-center space-y-4">
              <div className="text-6xl animate-emoji-pulse">💬</div>
              <h2 className="text-2xl font-heading font-bold">Welcome to MojiChat!</h2>
              <p className="text-muted-foreground">
                Select a conversation or start a new chat
              </p>
              <p className="text-sm text-muted-foreground">
                Your messages will be transformed into emojis 🎉
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatLayout;
