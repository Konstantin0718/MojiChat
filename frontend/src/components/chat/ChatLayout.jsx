import { useState, useEffect, useRef, useCallback, useMemo } from 'react';
import { useWebSocket } from '../../hooks/useWebSocket';
import { useNavigate, useParams } from 'react-router-dom';
import { motion, AnimatePresence } from 'framer-motion';
import { 
  Send, 
  Users, 
  MessageCircle, 
  LogOut,
  Menu,
  X,
  UserPlus,
  Paperclip,
  Smile,
  Globe,
  Settings,
  Image,
  Mic,
  Play,
  Pause,
  FileText,
  Film,
  Search,
  Video,
  Phone,
  PhoneOff,
  Bell,
  Camera
} from 'lucide-react';
import { useAuth } from '../../contexts/AuthContext';
import { ThemeToggle } from '../ui/ThemeToggle';
import { EmojiRevealCard } from './EmojiRevealCard';
import { TypingIndicator } from './TypingIndicator';
import { VoiceRecorder } from './VoiceRecorder';
import { FileUploader } from './FileUploader';
import { EmojiPicker } from './EmojiPicker';
import { LanguageSelector, LANGUAGES } from './LanguageSelector';
import { SearchDialog } from './SearchDialog';
import { VideoCall } from './VideoCall';
import { Button } from '../ui/button';
import { Input } from '../ui/input';
import { Avatar, AvatarFallback, AvatarImage } from '../ui/avatar';
import { ScrollArea } from '../ui/scroll-area';
import { Sheet, SheetContent } from '../ui/sheet';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogTrigger } from '../ui/dialog';
import { Popover, PopoverContent, PopoverTrigger } from '../ui/popover';
import { InstallPrompt } from '../pwa/InstallPrompt';
import { NotificationManager, NotificationSettings } from '../pwa/NotificationManager';
import { cn } from '../../lib/utils';
import { Toaster, toast } from 'sonner';

const API_URL = process.env.REACT_APP_BACKEND_URL;

export const ChatLayout = () => {
  const { user, logout, api, token } = useAuth();
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
  const [showEmojiPicker, setShowEmojiPicker] = useState(false);
  const [showFileUploader, setShowFileUploader] = useState(false);
  const [showVoiceRecorder, setShowVoiceRecorder] = useState(false);
  const [showCamera, setShowCamera] = useState(false);
  const [isSettingsOpen, setIsSettingsOpen] = useState(false);
  const [userLanguage, setUserLanguage] = useState(user?.preferred_language || 'bg');
  const [translationLang, setTranslationLang] = useState(() => localStorage.getItem('mojichat_translation_lang') || 'bg');
  const [isSearchOpen, setIsSearchOpen] = useState(false);
  const [activeCall, setActiveCall] = useState(null);
  const [incomingCall, setIncomingCall] = useState(null);
  
  const messagesEndRef = useRef(null);
  const typingTimeoutRef = useRef(null);
  const inputRef = useRef(null);
  const conversationIdRef = useRef(conversationId);
  useEffect(() => { conversationIdRef.current = conversationId; }, [conversationId]);

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
      const newMsgs = response.data;
      setMessages(prev => {
        // Only update if messages actually changed (preserve component state)
        if (prev.length !== newMsgs.length) return newMsgs;
        const lastOld = prev[prev.length - 1];
        const lastNew = newMsgs[newMsgs.length - 1];
        if (lastOld?.message_id !== lastNew?.message_id) return newMsgs;
        return prev;
      });
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

  // ==================== WEBSOCKET ====================
  const wsHandlers = useMemo(() => ({
    onNewMessage: (data) => {
      // Refresh messages if the event is for the currently open conversation.
      if (data.conversation_id === conversationIdRef.current) {
        fetchMessages();
      }
      // Always refresh conversation list (unread count, last message preview).
      fetchConversations();
    },
    onTyping: (data) => {
      if (data.conversation_id !== conversationIdRef.current) return;
      if (data.is_typing) {
        setTypingUsers((prev) => {
          const already = prev.find((u) => u.user_id === data.user_id);
          if (already) return prev;
          return [...prev, { user_id: data.user_id, user_name: data.user_name }];
        });
      } else {
        setTypingUsers((prev) => prev.filter((u) => u.user_id !== data.user_id));
      }
    },
    onOnlineStatus: (data) => {
      // Update online badge in conversation list without a full API call.
      setConversations((prev) =>
        prev.map((conv) => ({
          ...conv,
          participants: conv.participants?.map((p) =>
            p.user_id === data.user_id ? { ...p, is_online: data.is_online } : p
          ),
        }))
      );
    },
    onIncomingCall: (data) => {
      if (data.initiator_id !== user?.user_id && data.status === 'ringing') {
        setIncomingCall(data);
      }
    },
  }), [fetchMessages, fetchConversations, user?.user_id]); // eslint-disable-line

  useWebSocket(user, token, wsHandlers);

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

  // Fallback polling (15s) — keeps UI in sync if WebSocket reconnects or misses an event.
  useEffect(() => {
    const interval = setInterval(() => {
      fetchConversations();
      if (conversationId) fetchMessages();
    }, 15000);
    return () => clearInterval(interval);
  }, [conversationId, fetchConversations, fetchMessages]);

  // Scroll to bottom when messages change
  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [messages]);

  // Update user language
  useEffect(() => {
    if (user?.preferred_language) {
      setUserLanguage(user.preferred_language);
    }
  }, [user]);

  // Keyboard shortcut for search
  useEffect(() => {
    const handleKeyDown = (e) => {
      if ((e.metaKey || e.ctrlKey) && e.key === 'k') {
        e.preventDefault();
        setIsSearchOpen(true);
      }
      if (e.key === 'Escape') {
        setIsSearchOpen(false);
      }
    };
    
    window.addEventListener('keydown', handleKeyDown);
    return () => window.removeEventListener('keydown', handleKeyDown);
  }, []);

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

  // Send text message
  const sendMessage = async (e) => {
    e?.preventDefault();
    if (!newMessage.trim() || !conversationId || sending) return;

    setSending(true);
    try {
      await api.post(`/conversations/${conversationId}/messages`, {
        content: newMessage.trim(),
        message_type: 'text'
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

  // Send file message
  const sendFileMessage = async (fileData) => {
    if (!conversationId || sending) return;

    setSending(true);
    try {
      await api.post(`/conversations/${conversationId}/messages`, {
        content: fileData.file_name || 'File',
        message_type: fileData.file_type,
        file_url: fileData.file_url,
        file_name: fileData.file_name,
        file_size: fileData.file_size
      });
      setShowFileUploader(false);
      await fetchMessages();
    } catch (error) {
      toast.error('Failed to send file');
    } finally {
      setSending(false);
    }
  };

  // Send voice message
  const sendVoiceMessage = async (audioData, duration) => {
    if (!conversationId || sending) return;

    setSending(true);
    try {
      // Upload voice
      const uploadResponse = await api.post('/voice/upload', {
        audio_data: audioData,
        duration: duration
      });

      // Send message
      await api.post(`/conversations/${conversationId}/messages`, {
        content: 'Voice message',
        message_type: 'audio',
        file_url: uploadResponse.data.file_url,
        duration: duration
      });
      
      setShowVoiceRecorder(false);
      await fetchMessages();
    } catch (error) {
      toast.error('Failed to send voice message');
    } finally {
      setSending(false);
    }
  };

  // Add reaction to message
  const addReaction = async (messageId, emoji) => {
    try {
      await api.post(`/messages/${messageId}/reactions`, { emoji });
      await fetchMessages();
    } catch (error) {
      console.error('Failed to add reaction:', error);
    }
  };

  // Send GIF message
  const sendGifMessage = async (gif) => {
    if (!conversationId || sending) return;
    setSending(true);
    try {
      await api.post(`/conversations/${conversationId}/messages`, {
        content: gif.title || 'GIF',
        message_type: 'gif',
        file_url: gif.original_url || gif.url,
      });
      setShowEmojiPicker(false);
      await fetchMessages();
    } catch (error) {
      toast.error('Failed to send GIF');
    } finally {
      setSending(false);
    }
  };

  // Camera capture
  const handleCameraCapture = async () => {
    try {
      const stream = await navigator.mediaDevices.getUserMedia({ video: true });
      const video = document.createElement('video');
      video.srcObject = stream;
      video.autoplay = true;
      await video.play();

      // Wait a moment for camera to warm up
      await new Promise(r => setTimeout(r, 500));

      const canvas = document.createElement('canvas');
      canvas.width = video.videoWidth;
      canvas.height = video.videoHeight;
      canvas.getContext('2d').drawImage(video, 0, 0);

      // Stop camera
      stream.getTracks().forEach(t => t.stop());

      canvas.toBlob(async (blob) => {
        if (!blob) return;
        const formData = new FormData();
        formData.append('file', blob, `camera_${Date.now()}.jpg`);
        try {
          const uploadRes = await api.post('/upload', formData, {
            headers: { 'Content-Type': 'multipart/form-data' },
          });
          await api.post(`/conversations/${conversationId}/messages`, {
            content: 'Photo',
            message_type: 'image',
            file_url: uploadRes.data.file_url,
          });
          await fetchMessages();
        } catch (e) {
          toast.error('Failed to send photo');
        }
      }, 'image/jpeg', 0.85);
    } catch (err) {
      toast.error('Camera not available');
    }
  };

  // Update language preference (UI language - saved to server)
  const updateLanguage = async (langCode) => {
    try {
      await api.put('/users/language', { preferred_language: langCode });
      setUserLanguage(langCode);
      toast.success(`Език на интерфейса: ${LANGUAGES[langCode]?.name || langCode}`);
    } catch (error) {
      toast.error('Failed to update language');
    }
  };

  // Update translation language (local only - stored in localStorage)
  const updateTranslationLang = (langCode) => {
    setTranslationLang(langCode);
    localStorage.setItem('mojichat_translation_lang', langCode);
    toast.success(`Превод на: ${LANGUAGES[langCode]?.native || langCode}`);
  };

  // Start video/audio call
  const startCall = async (isVideo = true) => {
    if (!conversationId) return;
    
    try {
      const response = await api.post('/calls/initiate', {
        conversation_id: conversationId,
        is_video: isVideo
      });
      
      setActiveCall({
        ...response.data,
        is_video: isVideo,
        isInitiator: true
      });
      
      toast.success(`${isVideo ? 'Video' : 'Voice'} call started`);
    } catch (error) {
      toast.error('Failed to start call');
    }
  };

  // Answer incoming call
  const answerCall = () => {
    if (incomingCall) {
      setActiveCall({
        ...incomingCall,
        isInitiator: false
      });
      setIncomingCall(null);
    }
  };

  // Decline incoming call
  const declineCall = async () => {
    if (incomingCall) {
      try {
        await api.post(`/calls/${incomingCall.call_id}/end`);
      } catch (e) {}
      setIncomingCall(null);
    }
  };

  // End active call
  const endCall = () => {
    setActiveCall(null);
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

  // Render message based on type
  const renderMessage = (msg) => {
    const isOwn = msg.sender_id === user?.user_id;
    
    // For file/media messages
    if (msg.message_type === 'image' && msg.file_url) {
      return (
        <motion.div
          key={msg.message_id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn("flex", isOwn ? "justify-end" : "justify-start")}
        >
          <div className={cn(
            "max-w-[80%] rounded-2xl overflow-hidden",
            isOwn ? "rounded-br-sm" : "rounded-bl-sm"
          )}>
            <img 
              src={`${API_URL}${msg.file_url}`} 
              alt="Shared image" 
              className="max-w-full max-h-64 object-cover cursor-pointer hover:opacity-90 transition-opacity"
              onClick={() => window.open(`${API_URL}${msg.file_url}`, '_blank')}
            />
            <div className={cn(
              "px-3 py-1 text-xs",
              isOwn ? "bg-primary text-primary-foreground" : "bg-muted"
            )}>
              {new Date(msg.created_at).toLocaleTimeString('en-US', { hour: '2-digit', minute: '2-digit', hour12: false })}
            </div>
          </div>
        </motion.div>
      );
    }

    if (msg.message_type === 'video' && msg.file_url) {
      return (
        <motion.div
          key={msg.message_id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn("flex", isOwn ? "justify-end" : "justify-start")}
        >
          <div className={cn(
            "max-w-[80%] rounded-2xl overflow-hidden",
            isOwn ? "rounded-br-sm bg-primary" : "rounded-bl-sm bg-muted"
          )}>
            <video 
              src={`${API_URL}${msg.file_url}`} 
              controls 
              className="max-w-full max-h-64"
            />
          </div>
        </motion.div>
      );
    }

    if (msg.message_type === 'audio' && msg.file_url) {
      return (
        <motion.div
          key={msg.message_id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn("flex", isOwn ? "justify-end" : "justify-start")}
        >
          <div className={cn(
            "max-w-[80%] p-3 rounded-2xl",
            isOwn ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted"
          )}>
            <div className="flex items-center gap-3">
              <Mic className="w-5 h-5" />
              <audio src={`${API_URL}${msg.file_url}`} controls className="h-8" />
              {msg.duration && (
                <span className="text-xs opacity-70">
                  {Math.floor(msg.duration / 60)}:{(msg.duration % 60).toString().padStart(2, '0')}
                </span>
              )}
            </div>
          </div>
        </motion.div>
      );
    }

    if (msg.message_type === 'file' && msg.file_url) {
      return (
        <motion.div
          key={msg.message_id}
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className={cn("flex", isOwn ? "justify-end" : "justify-start")}
        >
          <a
            href={`${API_URL}${msg.file_url}`}
            target="_blank"
            rel="noopener noreferrer"
            className={cn(
              "max-w-[80%] p-4 rounded-2xl flex items-center gap-3 hover:opacity-90 transition-opacity",
              isOwn ? "rounded-br-sm bg-primary text-primary-foreground" : "rounded-bl-sm bg-muted"
            )}
          >
            <FileText className="w-8 h-8" />
            <div className="min-w-0">
              <p className="font-medium truncate">{msg.file_name || 'File'}</p>
              {msg.file_size && (
                <p className="text-xs opacity-70">
                  {(msg.file_size / 1024).toFixed(1)} KB
                </p>
              )}
            </div>
          </a>
        </motion.div>
      );
    }

    // Default: text message with emoji reveal
    return (
      <EmojiRevealCard
        key={msg.message_id}
        message={msg}
        isOwn={isOwn}
        currentUserId={user?.user_id}
        userLanguage={translationLang}
        onReaction={(emoji) => addReaction(msg.message_id, emoji)}
      />
    );
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
          <div className="flex items-center gap-2">
            <ThemeToggle />
          </div>
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
          <Dialog open={isSettingsOpen} onOpenChange={setIsSettingsOpen}>
            <DialogTrigger asChild>
              <Button variant="ghost" size="icon" data-testid="settings-btn">
                <Settings className="w-4 h-4" />
              </Button>
            </DialogTrigger>
            <DialogContent>
              <DialogHeader>
                <DialogTitle className="font-heading">Settings</DialogTitle>
              </DialogHeader>
              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Globe className="w-4 h-4" />
                    Език на интерфейса
                  </h4>
                  <p className="text-xs text-muted-foreground mb-3">
                    Промяна на езика на приложението
                  </p>
                  <LanguageSelector
                    currentLanguage={userLanguage}
                    onLanguageChange={updateLanguage}
                    variant="inline"
                    label="UI"
                  />
                </div>
                <div>
                  <h4 className="text-sm font-medium mb-3 flex items-center gap-2">
                    <Bell className="w-4 h-4" />
                    Notifications
                  </h4>
                  <NotificationSettings api={api} />
                </div>
              </div>
            </DialogContent>
          </Dialog>
        </div>
      </div>

      {/* Search button */}
      <div className="px-3 pb-2">
        <Button
          variant="outline"
          className="w-full justify-start gap-2 text-muted-foreground"
          onClick={() => setIsSearchOpen(true)}
          data-testid="search-btn"
        >
          <Search className="w-4 h-4" />
          Search messages...
          <kbd className="ml-auto text-xs bg-muted px-1.5 py-0.5 rounded">⌘K</kbd>
        </Button>
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
                      {conv.last_message.message_type !== 'text' 
                        ? `📎 ${conv.last_message.message_type}`
                        : conv.last_message.emoji_content?.slice(0, 20) || '🔮'}
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

      {/* Search Dialog */}
      <SearchDialog
        isOpen={isSearchOpen}
        onClose={() => setIsSearchOpen(false)}
        api={api}
        onSelectConversation={(convId) => navigate(`/chat/${convId}`)}
        onSelectMessage={(msg) => navigate(`/chat/${msg.conversation_id}`)}
      />

      {/* Video Call */}
      <AnimatePresence>
        {activeCall && (
          <VideoCall
            callId={activeCall.call_id}
            conversationId={activeCall.conversation_id}
            participants={currentConversation?.participants || []}
            currentUser={user}
            isInitiator={activeCall.isInitiator}
            isVideo={activeCall.is_video}
            api={api}
            onEnd={endCall}
          />
        )}
      </AnimatePresence>

      {/* Incoming Call Notification */}
      <AnimatePresence>
        {incomingCall && !activeCall && (
          <motion.div
            initial={{ opacity: 0, y: -100 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: -100 }}
            className="fixed top-4 left-4 right-4 md:left-auto md:right-4 md:w-80 z-50"
          >
            <div className="bg-card border border-border rounded-2xl shadow-lg p-4">
              <div className="flex items-center gap-3 mb-4">
                <Avatar className="w-12 h-12">
                  <AvatarFallback className="bg-primary text-white">
                    {incomingCall.initiator_name?.[0]?.toUpperCase()}
                  </AvatarFallback>
                </Avatar>
                <div>
                  <p className="font-medium">{incomingCall.initiator_name}</p>
                  <p className="text-sm text-muted-foreground">
                    {incomingCall.is_video ? 'Video' : 'Voice'} call...
                  </p>
                </div>
              </div>
              <div className="flex gap-2">
                <Button
                  onClick={declineCall}
                  variant="destructive"
                  className="flex-1 rounded-full"
                >
                  <PhoneOff className="w-4 h-4 mr-2" />
                  Decline
                </Button>
                <Button
                  onClick={answerCall}
                  className="flex-1 rounded-full bg-green-500 hover:bg-green-600"
                >
                  <Phone className="w-4 h-4 mr-2" />
                  Answer
                </Button>
              </div>
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* PWA Components */}
      <InstallPrompt />
      <NotificationManager api={api} user={user} />

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
              
              {/* Call buttons */}
              <div className="flex items-center gap-1">
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => startCall(false)}
                  className="rounded-full"
                  data-testid="voice-call-btn"
                >
                  <Phone className="w-5 h-5" />
                </Button>
                <Button
                  variant="ghost"
                  size="icon"
                  onClick={() => startCall(true)}
                  className="rounded-full"
                  data-testid="video-call-btn"
                >
                  <Video className="w-5 h-5" />
                </Button>
              </div>
              
              <LanguageSelector
                currentLanguage={translationLang}
                onLanguageChange={updateTranslationLang}
                label="Превод"
              />
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
                  {messages.map((msg) => renderMessage(msg))}
                </AnimatePresence>
                
                {typingUsers.length > 0 && (
                  <TypingIndicator userName={typingUsers[0]?.user_name} />
                )}
                
                <div ref={messagesEndRef} />
              </div>
            </ScrollArea>

            {/* File Uploader */}
            <AnimatePresence>
              {showFileUploader && (
                <motion.div
                  initial={{ height: 0, opacity: 0 }}
                  animate={{ height: 'auto', opacity: 1 }}
                  exit={{ height: 0, opacity: 0 }}
                  className="border-t border-border bg-card overflow-hidden"
                >
                  <div className="p-4 max-w-3xl mx-auto">
                    <div className="flex items-center justify-between mb-3">
                      <h4 className="font-medium">Send File</h4>
                      <Button
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowFileUploader(false)}
                      >
                        <X className="w-4 h-4" />
                      </Button>
                    </div>
                    <FileUploader
                      api={api}
                      onUpload={sendFileMessage}
                      onCancel={() => setShowFileUploader(false)}
                    />
                  </div>
                </motion.div>
              )}
            </AnimatePresence>

            {/* Message Input */}
            <div className="p-4 border-t border-border bg-card">
              <div className="flex items-center gap-2 max-w-3xl mx-auto relative">
                {/* Attachment button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={() => setShowFileUploader(!showFileUploader)}
                  className="rounded-full"
                  data-testid="attachment-btn"
                >
                  <Paperclip className="w-5 h-5" />
                </Button>

                {/* Camera button */}
                <Button
                  type="button"
                  variant="ghost"
                  size="icon"
                  onClick={handleCameraCapture}
                  className="rounded-full"
                  data-testid="camera-btn"
                >
                  <Camera className="w-5 h-5" />
                </Button>

                {/* Voice recorder or input */}
                {showVoiceRecorder ? (
                  <div className="flex-1">
                    <VoiceRecorder
                      onSend={sendVoiceMessage}
                      onCancel={() => setShowVoiceRecorder(false)}
                    />
                  </div>
                ) : (
                  <form onSubmit={sendMessage} className="flex-1 flex items-center gap-2">
                    <div className="flex-1 relative">
                      <Input
                        ref={inputRef}
                        value={newMessage}
                        onChange={(e) => {
                          setNewMessage(e.target.value);
                          handleTyping();
                        }}
                        placeholder="Type a message... (will be translated!)"
                        className="pr-10 rounded-full bg-muted border-none focus:ring-2 focus:ring-primary/50 px-6"
                        data-testid="message-input"
                      />
                      
                      {/* Emoji picker */}
                      <div className="absolute right-2 top-1/2 -translate-y-1/2">
                        <Popover open={showEmojiPicker} onOpenChange={setShowEmojiPicker}>
                          <PopoverTrigger asChild>
                            <Button
                              type="button"
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 rounded-full"
                              data-testid="emoji-picker-btn"
                            >
                              <Smile className="w-5 h-5" />
                            </Button>
                          </PopoverTrigger>
                          <PopoverContent className="w-80 p-0" align="end">
                            <EmojiPicker
                              onSelect={(emoji) => {
                                setNewMessage(prev => prev + emoji);
                                setShowEmojiPicker(false);
                              }}
                              onGifSelect={(gif) => {
                                sendGifMessage(gif);
                              }}
                              onClose={() => setShowEmojiPicker(false)}
                            />
                          </PopoverContent>
                        </Popover>
                      </div>
                    </div>

                    {/* Voice button */}
                    {!newMessage.trim() && (
                      <Button
                        type="button"
                        variant="ghost"
                        size="icon"
                        onClick={() => setShowVoiceRecorder(true)}
                        className="rounded-full"
                        data-testid="voice-btn"
                      >
                        <Mic className="w-5 h-5" />
                      </Button>
                    )}

                    {/* Send button */}
                    {newMessage.trim() && (
                      <Button
                        type="submit"
                        size="icon"
                        disabled={!newMessage.trim() || sending}
                        className="rounded-full w-10 h-10 shadow-neon"
                        data-testid="send-message-btn"
                      >
                        <Send className="w-5 h-5" />
                      </Button>
                    )}
                  </form>
                )}
              </div>
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
                <br />
                and translated automatically! 🌍
              </p>
            </div>
          </div>
        )}
      </div>
    </div>
  );
};

export default ChatLayout;
