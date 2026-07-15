const STORAGE_KEY = 'kitsunedesk.interface-language.v1';

const ptBR = Object.freeze({
  appLanguageApplied: 'Interface em português do Brasil.',
  embeddedHeadersFallback:
    'Este stream exige cabeçalhos, HLS ou codecs que o Chromium pode não reproduzir. O KitsuneDesk alternará com segurança para o MPV quando necessário.',
  skipContent: 'Pular para o conteúdo',
  navHome: 'Início',
  navSearch: 'Pesquisar',
  navContinue: 'Continuar assistindo',
  navLists: 'Minha lista',
  navHistory: 'Histórico',
  navTools: 'Ferramentas',
  navSettings: 'Configurações',
  navDiagnostics: 'Diagnóstico',
  navTelemetry: 'Telemetria',
  navUsers: 'Usuários',
  logout: 'Sair',
  searchAnime: 'Pesquisar anime',
  settingsPlaybackTitle: 'Reprodução',
  settingsPlaybackDescription: 'Preferências aplicadas por padrão a novas reproduções.',
  externalPlayerTitle: 'Janela externa do MPV',
  externalPlayerDescription:
    'Modo estável recomendado para evitar tela preta, travamentos e incompatibilidades do player incorporado.',
  playerMode: 'Modo do player',
  defaultProvider: 'Provedor padrão',
  defaultLanguage: 'Idioma padrão',
  defaultQuality: 'Resolução padrão',
  audioPreference: 'Preferência de áudio',
  downloadsFolder: 'Pasta de downloads',
  autoPlayNext: 'Reproduzir automaticamente o próximo episódio',
  rememberPosition: 'Salvar e retomar a posição do episódio',
  appearanceTitle: 'Aparência, idioma e manutenção',
  appearanceDescription: 'Personalize o tema, o idioma e as verificações opcionais.',
  theme: 'Tema',
  interfaceLanguage: 'Idioma da interface',
  checkUpdates: 'Verificar atualizações automaticamente',
  failureTelemetry: 'Registrar telemetria local de falhas',
  startupMetrics: 'Medir localmente o tempo de abertura',
  startupMetricsHelp:
    'Registra somente duração da interface, duração dos dados principais e uso do cache. Nenhum conteúdo assistido é incluído.',
  toolsDescriptionGoAnime: 'Busca, episódios, fallback e reprodução pelo MPV.',
  toolsDescriptionClassic: 'Fluxo original em terminal, preservado como alternativa.',
  toolsDescriptionAnimeCli: 'Alternativa brasileira com VLC e ambiente Python isolado.',
  toolsDescriptionAniCli: 'Cliente experimental; fontes externas podem ficar instáveis.',
  fastVsrDescription:
    'Super-resolução para arquivos locais. Esta ferramenta não fornece catálogos nem streams.',
  officialProvidersDescription:
    'Estes serviços usam contas e DRM próprios. O KitsuneDesk apenas abre o site oficial no navegador e não coleta credenciais.',
  authLoading: 'Carregando',
  authLogin: 'Entrar',
  authSetup: 'Configuração inicial',
  authName: 'Nome',
  authUsername: 'Usuário',
  authPassword: 'Senha',
  authConfirmPassword: 'Confirmar senha',
  authCreateAdmin: 'Criar administrador',
  authFirstAccess:
    'Primeiro acesso: use admin/admin123. Antes de acessar o aplicativo, será obrigatório criar uma senha forte.',
  authLockNotice:
    'Após tentativas inválidas, o bloqueio de segurança continua ativo mesmo se o aplicativo for reiniciado.',
  changePasswordTitle: 'Alterar senha',
  currentPassword: 'Senha atual',
  newPassword: 'Nova senha',
  confirmNewPassword: 'Confirmar nova senha',
  savePassword: 'Salvar senha',
  ruleLength: 'Oito caracteres',
  ruleUppercase: 'Uma letra maiúscula',
  ruleLowercase: 'Uma letra minúscula',
  ruleNumber: 'Um número',
  ruleSpecial: 'Um caractere especial',
  ruleMatch: 'Confirmação igual',
  diagnosticsWaiting:
    'Aguardando verificação manual. Nenhuma tarefa pesada será executada automaticamente ao abrir.',
  telemetryPrivacy:
    'Os registros de falha e as métricas de abertura permanecem somente neste computador e podem ser desativados separadamente.'
});

const dictionaries = Object.freeze({
  'pt-BR': ptBR,
  'en-US': {
    ...ptBR,
    appLanguageApplied: 'Interface set to English.',
    embeddedHeadersFallback:
      'This stream requires headers, HLS, or codecs Chromium may not play. KitsuneDesk will safely switch to MPV when needed.',
    skipContent: 'Skip to content',
    navHome: 'Home',
    navSearch: 'Search',
    navContinue: 'Continue watching',
    navLists: 'My list',
    navHistory: 'History',
    navTools: 'Tools',
    navSettings: 'Settings',
    navDiagnostics: 'Diagnostics',
    navTelemetry: 'Telemetry',
    navUsers: 'Users',
    logout: 'Sign out',
    searchAnime: 'Search anime',
    settingsPlaybackTitle: 'Playback',
    settingsPlaybackDescription: 'Default preferences for new playback sessions.',
    externalPlayerTitle: 'External MPV window',
    externalPlayerDescription:
      'Recommended stable mode to avoid black screens, crashes, and embedded-player incompatibilities.',
    playerMode: 'Player mode',
    defaultProvider: 'Default provider',
    defaultLanguage: 'Default language',
    defaultQuality: 'Default resolution',
    audioPreference: 'Audio preference',
    downloadsFolder: 'Downloads folder',
    autoPlayNext: 'Automatically play the next episode',
    rememberPosition: 'Save and resume episode position',
    appearanceTitle: 'Appearance, language, and maintenance',
    appearanceDescription: 'Customize the theme, language, and optional checks.',
    theme: 'Theme',
    interfaceLanguage: 'Interface language',
    checkUpdates: 'Automatically check for updates',
    failureTelemetry: 'Record local failure telemetry',
    startupMetrics: 'Measure startup time locally',
    startupMetricsHelp:
      'Records only interface time, core-data time, and cache usage. Watched content is never included.',
    toolsDescriptionGoAnime: 'Search, episodes, fallback, and MPV playback.',
    toolsDescriptionClassic: 'Original terminal workflow, kept as an alternative.',
    toolsDescriptionAnimeCli: 'Brazilian alternative with VLC and an isolated Python environment.',
    toolsDescriptionAniCli: 'Experimental client; external sources may become unstable.',
    fastVsrDescription:
      'Super-resolution for local files. This tool does not provide catalogs or streams.',
    officialProvidersDescription:
      'These services use their own accounts and DRM. KitsuneDesk only opens the official website and never collects credentials.',
    authLoading: 'Loading',
    authLogin: 'Sign in',
    authSetup: 'Initial setup',
    authName: 'Name',
    authUsername: 'Username',
    authPassword: 'Password',
    authConfirmPassword: 'Confirm password',
    authCreateAdmin: 'Create administrator',
    authFirstAccess:
      'First access: use admin/admin123. You must create a strong password before entering the app.',
    authLockNotice:
      'After invalid attempts, the security lock remains active even if the app is restarted.',
    changePasswordTitle: 'Change password',
    currentPassword: 'Current password',
    newPassword: 'New password',
    confirmNewPassword: 'Confirm new password',
    savePassword: 'Save password',
    ruleLength: 'Eight characters',
    ruleUppercase: 'One uppercase letter',
    ruleLowercase: 'One lowercase letter',
    ruleNumber: 'One number',
    ruleSpecial: 'One special character',
    ruleMatch: 'Matching confirmation',
    diagnosticsWaiting:
      'Waiting for a manual check. No heavy task will run automatically at startup.',
    telemetryPrivacy:
      'Failure logs and startup metrics stay on this computer and can be disabled separately.'
  },
  'es-ES': {
    ...ptBR,
    appLanguageApplied: 'Interfaz en español.',
    embeddedHeadersFallback:
      'Este stream requiere encabezados, HLS o códecs que Chromium puede no reproducir. KitsuneDesk cambiará de forma segura a MPV cuando sea necesario.',
    navHome: 'Inicio',
    navSearch: 'Buscar',
    navContinue: 'Seguir viendo',
    navLists: 'Mi lista',
    navHistory: 'Historial',
    navTools: 'Herramientas',
    navSettings: 'Configuración',
    navDiagnostics: 'Diagnóstico',
    navTelemetry: 'Telemetría',
    navUsers: 'Usuarios',
    logout: 'Salir',
    searchAnime: 'Buscar anime',
    settingsPlaybackTitle: 'Reproducción',
    settingsPlaybackDescription: 'Preferencias predeterminadas para nuevas reproducciones.',
    externalPlayerTitle: 'Ventana externa de MPV',
    externalPlayerDescription:
      'Modo estable recomendado para evitar pantallas negras, bloqueos e incompatibilidades.',
    playerMode: 'Modo del reproductor',
    defaultProvider: 'Proveedor predeterminado',
    defaultLanguage: 'Idioma predeterminado',
    defaultQuality: 'Resolución predeterminada',
    audioPreference: 'Preferencia de audio',
    downloadsFolder: 'Carpeta de descargas',
    autoPlayNext: 'Reproducir automáticamente el siguiente episodio',
    rememberPosition: 'Guardar y reanudar la posición',
    appearanceTitle: 'Apariencia, idioma y mantenimiento',
    appearanceDescription: 'Personaliza el tema, el idioma y las comprobaciones opcionales.',
    theme: 'Tema',
    interfaceLanguage: 'Idioma de la interfaz',
    checkUpdates: 'Buscar actualizaciones automáticamente',
    failureTelemetry: 'Registrar fallos localmente',
    startupMetrics: 'Medir localmente el tiempo de inicio',
    startupMetricsHelp:
      'Solo registra tiempos de interfaz, datos principales y uso de caché. No incluye contenido visto.',
    toolsDescriptionGoAnime: 'Búsqueda, episodios, respaldo y reproducción con MPV.',
    toolsDescriptionClassic: 'Flujo original en terminal, conservado como alternativa.',
    toolsDescriptionAnimeCli: 'Alternativa brasileña con VLC y un entorno Python aislado.',
    toolsDescriptionAniCli:
      'Cliente experimental; las fuentes externas pueden volverse inestables.',
    fastVsrDescription:
      'Superresolución para archivos locales. No proporciona catálogos ni streams.',
    officialProvidersDescription:
      'Estos servicios usan cuentas y DRM propios. KitsuneDesk solo abre el sitio oficial y nunca recopila credenciales.',
    diagnosticsWaiting:
      'Esperando una comprobación manual. No se ejecutarán tareas pesadas al iniciar.',
    telemetryPrivacy:
      'Los fallos y las métricas de inicio permanecen en este equipo y se pueden desactivar por separado.',
    authLoading: 'Cargando',
    authLogin: 'Entrar',
    authSetup: 'Configuración inicial',
    authName: 'Nombre',
    authUsername: 'Usuario',
    authPassword: 'Contraseña',
    authConfirmPassword: 'Confirmar contraseña',
    authCreateAdmin: 'Crear administrador',
    changePasswordTitle: 'Cambiar contraseña',
    currentPassword: 'Contraseña actual',
    newPassword: 'Nueva contraseña',
    confirmNewPassword: 'Confirmar nueva contraseña',
    savePassword: 'Guardar contraseña',
    authFirstAccess:
      'Primer acceso: usa admin/admin123. Deberás crear una contraseña segura antes de entrar.',
    authLockNotice:
      'Tras intentos inválidos, el bloqueo permanece activo aunque reinicies la aplicación.'
  },
  'fr-FR': {
    ...ptBR,
    appLanguageApplied: 'Interface en français.',
    embeddedHeadersFallback:
      'Ce stream exige des en-têtes, HLS ou codecs que Chromium peut ne pas lire. KitsuneDesk basculera vers MPV si nécessaire.',
    navHome: 'Accueil',
    navSearch: 'Rechercher',
    navContinue: 'Continuer à regarder',
    navLists: 'Ma liste',
    navHistory: 'Historique',
    navTools: 'Outils',
    navSettings: 'Paramètres',
    navDiagnostics: 'Diagnostic',
    navTelemetry: 'Télémétrie',
    navUsers: 'Utilisateurs',
    logout: 'Déconnexion',
    searchAnime: 'Rechercher un anime',
    settingsPlaybackTitle: 'Lecture',
    settingsPlaybackDescription: 'Préférences par défaut pour les nouvelles lectures.',
    externalPlayerTitle: 'Fenêtre MPV externe',
    externalPlayerDescription:
      'Mode stable recommandé pour éviter les écrans noirs, blocages et incompatibilités.',
    playerMode: 'Mode du lecteur',
    defaultProvider: 'Fournisseur par défaut',
    defaultLanguage: 'Langue par défaut',
    defaultQuality: 'Résolution par défaut',
    audioPreference: 'Préférence audio',
    downloadsFolder: 'Dossier de téléchargement',
    autoPlayNext: 'Lire automatiquement l’épisode suivant',
    rememberPosition: 'Enregistrer et reprendre la position',
    appearanceTitle: 'Apparence, langue et maintenance',
    appearanceDescription: 'Personnalisez le thème, la langue et les contrôles facultatifs.',
    theme: 'Thème',
    interfaceLanguage: 'Langue de l’interface',
    checkUpdates: 'Rechercher automatiquement les mises à jour',
    failureTelemetry: 'Enregistrer localement les erreurs',
    startupMetrics: 'Mesurer localement le temps de démarrage',
    startupMetricsHelp:
      'Enregistre uniquement les durées et le cache. Aucun contenu regardé n’est inclus.',
    toolsDescriptionGoAnime: 'Recherche, épisodes, repli et lecture avec MPV.',
    toolsDescriptionClassic:
      'Flux d’origine dans le terminal, conservé comme solution alternative.',
    toolsDescriptionAnimeCli: 'Solution brésilienne avec VLC et environnement Python isolé.',
    toolsDescriptionAniCli: 'Client expérimental ; les sources externes peuvent devenir instables.',
    fastVsrDescription:
      'Super-résolution pour les fichiers locaux. Aucun catalogue ni stream n’est fourni.',
    officialProvidersDescription:
      'Ces services utilisent leurs propres comptes et DRM. KitsuneDesk ouvre uniquement le site officiel et ne collecte jamais les identifiants.',
    diagnosticsWaiting:
      'En attente d’une vérification manuelle. Aucune tâche lourde ne sera lancée au démarrage.',
    telemetryPrivacy:
      'Les erreurs et métriques de démarrage restent sur cet ordinateur et peuvent être désactivées séparément.',
    authLoading: 'Chargement',
    authLogin: 'Connexion',
    authSetup: 'Configuration initiale',
    authName: 'Nom',
    authUsername: 'Nom d’utilisateur',
    authPassword: 'Mot de passe',
    authConfirmPassword: 'Confirmer le mot de passe',
    authCreateAdmin: 'Créer l’administrateur',
    changePasswordTitle: 'Modifier le mot de passe',
    currentPassword: 'Mot de passe actuel',
    newPassword: 'Nouveau mot de passe',
    confirmNewPassword: 'Confirmer le nouveau mot de passe',
    savePassword: 'Enregistrer',
    authFirstAccess:
      'Premier accès : utilisez admin/admin123. Un mot de passe fort sera ensuite obligatoire.',
    authLockNotice:
      'Après des tentatives invalides, le verrouillage reste actif même après un redémarrage.'
  },
  'de-DE': {
    ...ptBR,
    appLanguageApplied: 'Benutzeroberfläche auf Deutsch.',
    embeddedHeadersFallback:
      'Dieser Stream benötigt Header, HLS oder Codecs, die Chromium möglicherweise nicht abspielt. KitsuneDesk wechselt bei Bedarf sicher zu MPV.',
    navHome: 'Start',
    navSearch: 'Suchen',
    navContinue: 'Weiterschauen',
    navLists: 'Meine Liste',
    navHistory: 'Verlauf',
    navTools: 'Werkzeuge',
    navSettings: 'Einstellungen',
    navDiagnostics: 'Diagnose',
    navTelemetry: 'Telemetrie',
    navUsers: 'Benutzer',
    logout: 'Abmelden',
    searchAnime: 'Anime suchen',
    settingsPlaybackTitle: 'Wiedergabe',
    settingsPlaybackDescription: 'Standardeinstellungen für neue Wiedergaben.',
    externalPlayerTitle: 'Externes MPV-Fenster',
    externalPlayerDescription:
      'Empfohlener stabiler Modus gegen schwarze Bilder, Abstürze und Inkompatibilitäten.',
    playerMode: 'Player-Modus',
    defaultProvider: 'Standardanbieter',
    defaultLanguage: 'Standardsprache',
    defaultQuality: 'Standardauflösung',
    audioPreference: 'Audioeinstellung',
    downloadsFolder: 'Downloadordner',
    autoPlayNext: 'Nächste Episode automatisch abspielen',
    rememberPosition: 'Position speichern und fortsetzen',
    appearanceTitle: 'Darstellung, Sprache und Wartung',
    appearanceDescription: 'Theme, Sprache und optionale Prüfungen anpassen.',
    theme: 'Theme',
    interfaceLanguage: 'Sprache der Oberfläche',
    checkUpdates: 'Automatisch nach Updates suchen',
    failureTelemetry: 'Lokale Fehlertelemetrie speichern',
    startupMetrics: 'Startzeit lokal messen',
    startupMetricsHelp:
      'Speichert nur Ladezeiten und Cache-Nutzung. Angesehene Inhalte werden nicht erfasst.',
    toolsDescriptionGoAnime: 'Suche, Episoden, Ausweichpfad und Wiedergabe mit MPV.',
    toolsDescriptionClassic: 'Ursprünglicher Terminal-Ablauf als Alternative.',
    toolsDescriptionAnimeCli: 'Brasilianische Alternative mit VLC und isolierter Python-Umgebung.',
    toolsDescriptionAniCli: 'Experimenteller Client; externe Quellen können instabil werden.',
    fastVsrDescription:
      'Super-Resolution für lokale Dateien. Dieses Werkzeug liefert keine Kataloge oder Streams.',
    officialProvidersDescription:
      'Diese Dienste verwenden eigene Konten und DRM. KitsuneDesk öffnet nur die offizielle Website und sammelt keine Zugangsdaten.',
    diagnosticsWaiting:
      'Warten auf eine manuelle Prüfung. Beim Start werden keine schweren Aufgaben ausgeführt.',
    telemetryPrivacy:
      'Fehlerprotokolle und Startmetriken bleiben auf diesem Computer und sind getrennt deaktivierbar.',
    authLoading: 'Laden',
    authLogin: 'Anmelden',
    authSetup: 'Ersteinrichtung',
    authName: 'Name',
    authUsername: 'Benutzername',
    authPassword: 'Passwort',
    authConfirmPassword: 'Passwort bestätigen',
    authCreateAdmin: 'Administrator erstellen',
    changePasswordTitle: 'Passwort ändern',
    currentPassword: 'Aktuelles Passwort',
    newPassword: 'Neues Passwort',
    confirmNewPassword: 'Neues Passwort bestätigen',
    savePassword: 'Passwort speichern',
    authFirstAccess:
      'Erster Zugriff: admin/admin123 verwenden. Danach muss ein starkes Passwort erstellt werden.',
    authLockNotice: 'Nach ungültigen Versuchen bleibt die Sperre auch nach einem Neustart aktiv.'
  },
  'ja-JP': {
    ...ptBR,
    appLanguageApplied: '日本語表示に設定しました。',
    embeddedHeadersFallback:
      'このストリームは Chromium で再生できないヘッダー、HLS、またはコーデックを必要とします。必要に応じて安全に MPV へ切り替えます。',
    navHome: 'ホーム',
    navSearch: '検索',
    navContinue: '続きを見る',
    navLists: 'マイリスト',
    navHistory: '履歴',
    navTools: 'ツール',
    navSettings: '設定',
    navDiagnostics: '診断',
    navTelemetry: 'テレメトリ',
    navUsers: 'ユーザー',
    logout: 'ログアウト',
    searchAnime: 'アニメを検索',
    settingsPlaybackTitle: '再生',
    settingsPlaybackDescription: '新しい再生に使用する既定の設定です。',
    externalPlayerTitle: '外部 MPV ウィンドウ',
    externalPlayerDescription: '黒画面、停止、埋め込みプレイヤーの非互換を避ける推奨モードです。',
    playerMode: 'プレイヤーモード',
    defaultProvider: '既定のプロバイダー',
    defaultLanguage: '既定の言語',
    defaultQuality: '既定の解像度',
    audioPreference: '音声設定',
    downloadsFolder: 'ダウンロード先',
    autoPlayNext: '次のエピソードを自動再生',
    rememberPosition: '再生位置を保存して再開',
    appearanceTitle: '外観・言語・メンテナンス',
    appearanceDescription: 'テーマ、言語、任意の確認機能を設定します。',
    theme: 'テーマ',
    interfaceLanguage: '表示言語',
    checkUpdates: '更新を自動確認',
    failureTelemetry: '障害情報をローカルに記録',
    startupMetrics: '起動時間をローカルで測定',
    startupMetricsHelp:
      '画面と主要データの時間、キャッシュ利用のみを記録します。視聴内容は含みません。',
    toolsDescriptionGoAnime: '検索、エピソード、フォールバック、MPV 再生に対応します。',
    toolsDescriptionClassic: '従来のターミナル方式を代替手段として維持します。',
    toolsDescriptionAnimeCli: 'VLC と分離された Python 環境を使用するブラジル向け代替手段です。',
    toolsDescriptionAniCli: '実験的なクライアントです。外部ソースは不安定になる場合があります。',
    fastVsrDescription:
      'ローカルファイル用の超解像ツールです。カタログやストリームは提供しません。',
    officialProvidersDescription:
      '各サービスは独自のアカウントと DRM を使用します。KitsuneDesk は公式サイトを開くだけで、認証情報を収集しません。',
    diagnosticsWaiting: '手動診断を待っています。起動時に重い処理は自動実行されません。',
    telemetryPrivacy:
      '障害ログと起動メトリクスはこのコンピューター内に保存され、個別に無効化できます。',
    authLoading: '読み込み中',
    authLogin: 'ログイン',
    authSetup: '初期設定',
    authName: '名前',
    authUsername: 'ユーザー名',
    authPassword: 'パスワード',
    authConfirmPassword: 'パスワード確認',
    authCreateAdmin: '管理者を作成',
    changePasswordTitle: 'パスワード変更',
    currentPassword: '現在のパスワード',
    newPassword: '新しいパスワード',
    confirmNewPassword: '新しいパスワードの確認',
    savePassword: '保存',
    authFirstAccess: '初回は admin/admin123 を使用し、その後に強力なパスワードを設定してください。',
    authLockNotice: '無効な試行によるロックは、アプリを再起動しても継続します。'
  }
});

let currentLanguage = readStoredLanguage();

export function applyInterfaceLanguage(language) {
  currentLanguage = dictionaries[language] ? language : 'pt-BR';
  document.documentElement.lang = currentLanguage;
  document.body.dataset.interfaceLanguage = currentLanguage;
  try {
    localStorage.setItem(STORAGE_KEY, currentLanguage);
  } catch {
    // O idioma ainda funciona quando o armazenamento está indisponível.
  }
  translateDocument();
  document.dispatchEvent(
    new CustomEvent('kitsunedesk:language-changed', { detail: { language: currentLanguage } })
  );
  return currentLanguage;
}

export function applyStoredInterfaceLanguage() {
  return applyInterfaceLanguage(readStoredLanguage());
}

export function translate(key) {
  return dictionaries[currentLanguage]?.[key] || ptBR[key] || key;
}

export function translateDocument(root = document) {
  root.querySelectorAll('[data-i18n]').forEach((element) => {
    element.textContent = translate(element.dataset.i18n);
  });
  root.querySelectorAll('[data-i18n-placeholder]').forEach((element) => {
    element.setAttribute('placeholder', translate(element.dataset.i18nPlaceholder));
  });
  root.querySelectorAll('[data-i18n-title]').forEach((element) => {
    element.setAttribute('title', translate(element.dataset.i18nTitle));
  });
}

function readStoredLanguage() {
  try {
    const stored = localStorage.getItem(STORAGE_KEY);
    if (dictionaries[stored]) return stored;
  } catch {
    // Usa o idioma padrão.
  }
  return 'pt-BR';
}
