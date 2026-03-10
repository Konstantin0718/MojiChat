import { I18n } from 'i18n-js';
import { getLocales } from 'expo-localization';
import AsyncStorage from '@react-native-async-storage/async-storage';

// Translations
const translations = {
  en: {
    // Common
    app_name: 'MijiChat',
    ok: 'OK',
    cancel: 'Cancel',
    save: 'Save',
    delete: 'Delete',
    edit: 'Edit',
    send: 'Send',
    search: 'Search',
    loading: 'Loading...',
    error: 'Error',
    success: 'Success',
    
    // Auth
    login: 'Login',
    register: 'Register',
    logout: 'Logout',
    email: 'Email',
    password: 'Password',
    confirm_password: 'Confirm Password',
    forgot_password: 'Forgot Password?',
    reset_password: 'Reset Password',
    phone_login: 'Continue with Phone',
    verification_code: 'Verification Code',
    enter_code: 'Enter the 6-digit code',
    send_code: 'Send Code',
    resend_code: 'Resend Code',
    your_name: 'Your Name',
    
    // Chat
    chats: 'Chats',
    new_chat: 'New Chat',
    new_group: 'New Group',
    type_message: 'Type a message...',
    voice_message: 'Voice Message',
    tap_to_reveal: 'Tap to reveal',
    online: 'Online',
    offline: 'Offline',
    typing: 'typing...',
    read: 'Read',
    delivered: 'Delivered',
    
    // Video Call
    video_call: 'Video Call',
    voice_call: 'Voice Call',
    incoming_call: 'Incoming Call',
    call_ended: 'Call Ended',
    calling: 'Calling...',
    end_call: 'End Call',
    mute: 'Mute',
    unmute: 'Unmute',
    camera_on: 'Camera On',
    camera_off: 'Camera Off',
    speaker: 'Speaker',
    
    // Settings
    settings: 'Settings',
    profile: 'Profile',
    theme: 'Theme',
    dark_mode: 'Dark Mode',
    light_mode: 'Light Mode',
    system_theme: 'System',
    language: 'Language',
    notifications: 'Notifications',
    notification_sound: 'Notification Sound',
    vibration: 'Vibration',
    privacy: 'Privacy',
    blocked_users: 'Blocked Users',
    about: 'About',
    version: 'Version',
    
    // Permissions
    camera_permission: 'Camera Permission',
    camera_permission_msg: 'Allow access to camera for video calls and photos',
    microphone_permission: 'Microphone Permission',
    microphone_permission_msg: 'Allow access to microphone for voice messages and calls',
    contacts_permission: 'Contacts Permission',
    contacts_permission_msg: 'Allow access to contacts to find friends',
    notification_permission: 'Notification Permission',
    notification_permission_msg: 'Allow notifications to receive messages',
    allow: 'Allow',
    deny: 'Deny',
    
    // Stickers
    stickers: 'Stickers',
    gifs: 'GIFs',
    emoji: 'Emoji',
    
    // Status/Story
    my_status: 'My Status',
    status_updates: 'Status Updates',
    add_status: 'Add Status',
    confirm_status: 'Confirm Status',
    post_this_photo: 'Post this photo as your status?',
    status_posted: 'Status posted!',
    failed_to_post_status: 'Failed to post status',
    
    // Settings - Emoji
    emoji_mode: 'Emoji Mode',
    emoji_mode_desc: 'Show messages as emojis (tap to reveal text)',
    
    // Errors
    network_error: 'Network error. Please try again.',
    invalid_credentials: 'Invalid email or password',
    user_not_found: 'User not found',
    something_went_wrong: 'Something went wrong',
  },
  
  bg: {
    // Common
    app_name: 'MijiChat',
    ok: 'ОК',
    cancel: 'Отказ',
    save: 'Запази',
    delete: 'Изтрий',
    edit: 'Редактирай',
    send: 'Изпрати',
    search: 'Търсене',
    loading: 'Зареждане...',
    error: 'Грешка',
    success: 'Успех',
    
    // Auth
    login: 'Вход',
    register: 'Регистрация',
    logout: 'Изход',
    email: 'Имейл',
    password: 'Парола',
    confirm_password: 'Потвърди парола',
    forgot_password: 'Забравена парола?',
    reset_password: 'Нова парола',
    phone_login: 'Продължи с телефон',
    verification_code: 'Код за потвърждение',
    enter_code: 'Въведете 6-цифрения код',
    send_code: 'Изпрати код',
    resend_code: 'Изпрати отново',
    your_name: 'Вашето име',
    
    // Chat
    chats: 'Чатове',
    new_chat: 'Нов чат',
    new_group: 'Нова група',
    type_message: 'Напишете съобщение...',
    voice_message: 'Гласово съобщение',
    tap_to_reveal: 'Натисни за текст',
    online: 'На линия',
    offline: 'Офлайн',
    typing: 'пише...',
    read: 'Прочетено',
    delivered: 'Доставено',
    
    // Video Call
    video_call: 'Видео разговор',
    voice_call: 'Гласов разговор',
    incoming_call: 'Входящо обаждане',
    call_ended: 'Разговорът приключи',
    calling: 'Обаждане...',
    end_call: 'Край',
    mute: 'Изключи микрофон',
    unmute: 'Включи микрофон',
    camera_on: 'Включи камера',
    camera_off: 'Изключи камера',
    speaker: 'Високоговорител',
    
    // Settings
    settings: 'Настройки',
    profile: 'Профил',
    theme: 'Тема',
    dark_mode: 'Тъмна',
    light_mode: 'Светла',
    system_theme: 'Системна',
    language: 'Език',
    notifications: 'Известия',
    notification_sound: 'Звук за известия',
    vibration: 'Вибрация',
    privacy: 'Поверителност',
    blocked_users: 'Блокирани потребители',
    about: 'Относно',
    version: 'Версия',
    
    // Permissions
    camera_permission: 'Достъп до камера',
    camera_permission_msg: 'Разрешете достъп до камерата за видео разговори и снимки',
    microphone_permission: 'Достъп до микрофон',
    microphone_permission_msg: 'Разрешете достъп до микрофона за гласови съобщения и разговори',
    contacts_permission: 'Достъп до контакти',
    contacts_permission_msg: 'Разрешете достъп до контактите за да намерите приятели',
    notification_permission: 'Известия',
    notification_permission_msg: 'Разрешете известията за да получавате съобщения',
    allow: 'Разреши',
    deny: 'Откажи',
    
    // Stickers
    stickers: 'Стикери',
    gifs: 'GIF-ове',
    emoji: 'Емоджи',
    
    // Status/Story
    my_status: 'Моят статус',
    status_updates: 'Статуси',
    add_status: 'Добави статус',
    confirm_status: 'Потвърди статус',
    post_this_photo: 'Публикувай тази снимка като статус?',
    status_posted: 'Статусът е публикуван!',
    failed_to_post_status: 'Неуспешно публикуване на статус',
    
    // Settings - Emoji
    emoji_mode: 'Режим емоджи',
    emoji_mode_desc: 'Показвай съобщенията като емоджи (натисни за текст)',
    
    // Errors
    network_error: 'Грешка в мрежата. Опитайте отново.',
    invalid_credentials: 'Грешен имейл или парола',
    user_not_found: 'Потребителят не е намерен',
    something_went_wrong: 'Нещо се обърка',
  },
  
  ru: {
    // Common
    app_name: 'MijiChat',
    ok: 'ОК',
    cancel: 'Отмена',
    save: 'Сохранить',
    delete: 'Удалить',
    edit: 'Редактировать',
    send: 'Отправить',
    search: 'Поиск',
    loading: 'Загрузка...',
    error: 'Ошибка',
    success: 'Успех',
    
    // Auth
    login: 'Вход',
    register: 'Регистрация',
    logout: 'Выход',
    email: 'Email',
    password: 'Пароль',
    confirm_password: 'Подтвердить пароль',
    forgot_password: 'Забыли пароль?',
    reset_password: 'Сбросить пароль',
    phone_login: 'Войти по номеру',
    verification_code: 'Код подтверждения',
    enter_code: 'Введите 6-значный код',
    send_code: 'Отправить код',
    resend_code: 'Отправить снова',
    your_name: 'Ваше имя',
    
    // Chat
    chats: 'Чаты',
    new_chat: 'Новый чат',
    new_group: 'Новая группа',
    type_message: 'Введите сообщение...',
    voice_message: 'Голосовое сообщение',
    tap_to_reveal: 'Нажмите для текста',
    online: 'В сети',
    offline: 'Не в сети',
    typing: 'печатает...',
    read: 'Прочитано',
    delivered: 'Доставлено',
    
    // Video Call
    video_call: 'Видеозвонок',
    voice_call: 'Голосовой звонок',
    incoming_call: 'Входящий звонок',
    call_ended: 'Звонок завершен',
    calling: 'Вызов...',
    end_call: 'Завершить',
    mute: 'Выкл. микрофон',
    unmute: 'Вкл. микрофон',
    camera_on: 'Вкл. камеру',
    camera_off: 'Выкл. камеру',
    speaker: 'Динамик',
    
    // Settings
    settings: 'Настройки',
    profile: 'Профиль',
    theme: 'Тема',
    dark_mode: 'Тёмная',
    light_mode: 'Светлая',
    system_theme: 'Системная',
    language: 'Язык',
    notifications: 'Уведомления',
    notification_sound: 'Звук уведомлений',
    vibration: 'Вибрация',
    privacy: 'Конфиденциальность',
    blocked_users: 'Заблокированные',
    about: 'О приложении',
    version: 'Версия',
    
    // Permissions
    camera_permission: 'Доступ к камере',
    camera_permission_msg: 'Разрешите доступ к камере для видеозвонков',
    microphone_permission: 'Доступ к микрофону',
    microphone_permission_msg: 'Разрешите доступ к микрофону для голосовых сообщений',
    contacts_permission: 'Доступ к контактам',
    contacts_permission_msg: 'Разрешите доступ к контактам чтобы найти друзей',
    notification_permission: 'Уведомления',
    notification_permission_msg: 'Разрешите уведомления для получения сообщений',
    allow: 'Разрешить',
    deny: 'Отклонить',
    
    // Stickers
    stickers: 'Стикеры',
    gifs: 'GIF',
    emoji: 'Эмодзи',
    
    // Status/Story
    my_status: 'Мой статус',
    status_updates: 'Статусы',
    add_status: 'Добавить статус',
    confirm_status: 'Подтвердить статус',
    post_this_photo: 'Опубликовать это фото как статус?',
    status_posted: 'Статус опубликован!',
    failed_to_post_status: 'Не удалось опубликовать статус',
    
    // Settings - Emoji
    emoji_mode: 'Режим эмодзи',
    emoji_mode_desc: 'Показывать сообщения как эмодзи (нажмите для текста)',
    
    // Errors
    network_error: 'Ошибка сети. Попробуйте снова.',
    invalid_credentials: 'Неверный email или пароль',
    user_not_found: 'Пользователь не найден',
    something_went_wrong: 'Что-то пошло не так',
  },
  
  de: {
    app_name: 'MijiChat',
    ok: 'OK',
    cancel: 'Abbrechen',
    save: 'Speichern',
    delete: 'Löschen',
    edit: 'Bearbeiten',
    send: 'Senden',
    search: 'Suchen',
    loading: 'Laden...',
    error: 'Fehler',
    success: 'Erfolg',
    login: 'Anmelden',
    register: 'Registrieren',
    logout: 'Abmelden',
    email: 'E-Mail',
    password: 'Passwort',
    confirm_password: 'Passwort bestätigen',
    forgot_password: 'Passwort vergessen?',
    reset_password: 'Passwort zurücksetzen',
    phone_login: 'Mit Telefon fortfahren',
    verification_code: 'Bestätigungscode',
    enter_code: 'Geben Sie den 6-stelligen Code ein',
    send_code: 'Code senden',
    resend_code: 'Erneut senden',
    your_name: 'Ihr Name',
    chats: 'Chats',
    new_chat: 'Neuer Chat',
    new_group: 'Neue Gruppe',
    type_message: 'Nachricht eingeben...',
    voice_message: 'Sprachnachricht',
    tap_to_reveal: 'Tippen zum Anzeigen',
    online: 'Online',
    offline: 'Offline',
    typing: 'tippt...',
    settings: 'Einstellungen',
    profile: 'Profil',
    theme: 'Design',
    dark_mode: 'Dunkel',
    light_mode: 'Hell',
    language: 'Sprache',
    notifications: 'Benachrichtigungen',
    video_call: 'Videoanruf',
    voice_call: 'Sprachanruf',
    end_call: 'Beenden',
    stickers: 'Sticker',
    gifs: 'GIFs',
    emoji: 'Emoji',
  },
  
  es: {
    app_name: 'MijiChat',
    ok: 'OK',
    cancel: 'Cancelar',
    save: 'Guardar',
    delete: 'Eliminar',
    edit: 'Editar',
    send: 'Enviar',
    search: 'Buscar',
    loading: 'Cargando...',
    error: 'Error',
    success: 'Éxito',
    login: 'Iniciar sesión',
    register: 'Registrarse',
    logout: 'Cerrar sesión',
    email: 'Correo',
    password: 'Contraseña',
    forgot_password: '¿Olvidaste tu contraseña?',
    phone_login: 'Continuar con teléfono',
    chats: 'Chats',
    new_chat: 'Nuevo chat',
    new_group: 'Nuevo grupo',
    type_message: 'Escribe un mensaje...',
    voice_message: 'Mensaje de voz',
    tap_to_reveal: 'Toca para ver',
    online: 'En línea',
    offline: 'Desconectado',
    typing: 'escribiendo...',
    settings: 'Ajustes',
    profile: 'Perfil',
    theme: 'Tema',
    dark_mode: 'Oscuro',
    light_mode: 'Claro',
    language: 'Idioma',
    notifications: 'Notificaciones',
    video_call: 'Videollamada',
    voice_call: 'Llamada de voz',
    end_call: 'Finalizar',
    stickers: 'Stickers',
    gifs: 'GIFs',
    emoji: 'Emoji',
  },
  
  fr: {
    app_name: 'MijiChat',
    ok: 'OK',
    cancel: 'Annuler',
    save: 'Enregistrer',
    delete: 'Supprimer',
    edit: 'Modifier',
    send: 'Envoyer',
    search: 'Rechercher',
    loading: 'Chargement...',
    error: 'Erreur',
    success: 'Succès',
    login: 'Connexion',
    register: 'Inscription',
    logout: 'Déconnexion',
    email: 'E-mail',
    password: 'Mot de passe',
    forgot_password: 'Mot de passe oublié?',
    phone_login: 'Continuer avec téléphone',
    chats: 'Discussions',
    new_chat: 'Nouvelle discussion',
    new_group: 'Nouveau groupe',
    type_message: 'Tapez un message...',
    voice_message: 'Message vocal',
    tap_to_reveal: 'Appuyez pour révéler',
    online: 'En ligne',
    offline: 'Hors ligne',
    typing: 'écrit...',
    settings: 'Paramètres',
    profile: 'Profil',
    theme: 'Thème',
    dark_mode: 'Sombre',
    light_mode: 'Clair',
    language: 'Langue',
    notifications: 'Notifications',
    video_call: 'Appel vidéo',
    voice_call: 'Appel vocal',
    end_call: 'Terminer',
    stickers: 'Autocollants',
    gifs: 'GIFs',
    emoji: 'Emoji',
  },
};

// Create i18n instance
const i18n = new I18n(translations);

// Set the locale based on device language
const deviceLocale = getLocales()[0]?.languageCode || 'en';
i18n.locale = deviceLocale;
i18n.enableFallback = true;
i18n.defaultLocale = 'en';

// Storage key for user's language preference
const LANGUAGE_KEY = '@app_language';

// Initialize language from storage
export const initializeLanguage = async () => {
  try {
    const savedLanguage = await AsyncStorage.getItem(LANGUAGE_KEY);
    if (savedLanguage) {
      i18n.locale = savedLanguage;
    }
  } catch (error) {
    console.log('Error loading language preference:', error);
  }
};

// Set language and persist to storage
export const setLanguage = async (languageCode: string) => {
  try {
    i18n.locale = languageCode;
    await AsyncStorage.setItem(LANGUAGE_KEY, languageCode);
  } catch (error) {
    console.log('Error saving language preference:', error);
  }
};

// Get current language
export const getCurrentLanguage = () => i18n.locale;

// Available languages with native names
export const availableLanguages = {
  en: 'English',
  bg: 'Български',
  ru: 'Русский',
  de: 'Deutsch',
  es: 'Español',
  fr: 'Français',
};

// Translation function
export const t = (key: string, options?: object) => i18n.t(key, options);

export default i18n;
