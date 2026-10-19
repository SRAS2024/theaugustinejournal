/* The Augustine Journal — automatic translation for visitors.
 *
 * The page is always served in English. When the visitor's browser prefers
 * Spanish, Portuguese, French, German or Russian, this script:
 *   1. translates interface text from the built-in dictionaries below,
 *   2. shows dates and counts the way that language writes them, and
 *   3. replaces post titles, post bodies, notices and the home page text with
 *      translations from the site's own translation engine (/api/translations),
 *      which keeps translating in the background until every part is done.
 * Nothing is remembered between visits, so a shared link always opens in the
 * reader's own language.
 */
(function () {
  "use strict";

  var SITE_LANG = "en";
  var SUPPORTED = ["en", "es", "pt", "fr", "de", "ru"];
  var LOCALES = { en: "en-US", es: "es", pt: "pt-BR", fr: "fr", de: "de", ru: "ru" };
  var NNBSP = " ";

  /* ===== Interface text ===== */
  var ui = {
    /* ── Public navigation ── */
    home:    { en: "Home",    es: "Inicio",   pt: "Início",  fr: "Accueil", de: "Startseite", ru: "Главная" },
    blog:    { en: "Blog",    es: "Blog",     pt: "Blog",    fr: "Blog",    de: "Blog",       ru: "Блог" },
    essays:  { en: "Essays",  es: "Ensayos",  pt: "Ensaios", fr: "Essais",  de: "Essays",     ru: "Эссе" },
    essay:   { en: "Essay",   es: "Ensayo",   pt: "Ensaio",  fr: "Essai",   de: "Essay",      ru: "Эссе" },
    letters: { en: "Letters", es: "Cartas",   pt: "Cartas",  fr: "Lettres", de: "Briefe",     ru: "Письма" },
    letter:  { en: "Letter",  es: "Carta",    pt: "Carta",   fr: "Lettre",  de: "Brief",      ru: "Письмо" },
    toggleNavigation:  { en: "Toggle navigation", es: "Abrir o cerrar el menú", pt: "Abrir ou fechar o menu", fr: "Ouvrir ou fermer le menu", de: "Menü öffnen oder schließen", ru: "Открыть или закрыть меню" },
    primaryNavigation: { en: "Primary navigation", es: "Navegación principal", pt: "Navegação principal", fr: "Navigation principale", de: "Hauptnavigation", ru: "Основная навигация" },

    /* ── Public content labels ── */
    checkLatest: {
      en: "Check out our latest post",
      es: "Mira nuestra publicación más reciente",
      pt: "Confira nossa publicação mais recente",
      fr: "Découvrez notre dernière publication",
      de: "Lesen Sie unseren neuesten Beitrag",
      ru: "Читайте нашу последнюю публикацию"
    },
    noPostsYet: {
      en: "No posts yet.",
      es: "Todavía no hay publicaciones.",
      pt: "Ainda não há publicações.",
      fr: "Aucune publication pour le moment.",
      de: "Noch keine Beiträge.",
      ru: "Публикаций пока нет."
    },
    share:      { en: "Share", es: "Compartir", pt: "Compartilhar", fr: "Partager", de: "Teilen", ru: "Поделиться" },
    viewPdf:    { en: "View Original PDF", es: "Ver el PDF original", pt: "Ver o PDF original", fr: "Voir le PDF original", de: "Original-PDF ansehen", ru: "Открыть исходный PDF" },
    linkCopied: { en: "Link copied!", es: "¡Enlace copiado!", pt: "Link copiado!", fr: "Lien copié" + NNBSP + "!", de: "Link kopiert!", ru: "Ссылка скопирована!" },
    copyFailed: { en: "Could not copy the link", es: "No se pudo copiar el enlace", pt: "Não foi possível copiar o link", fr: "Impossible de copier le lien", de: "Der Link konnte nicht kopiert werden", ru: "Не удалось скопировать ссылку" },
    close:      { en: "Close", es: "Cerrar", pt: "Fechar", fr: "Fermer", de: "Schließen", ru: "Закрыть" },
    somethingWentWrong: {
      en: "Something went wrong. Please try again.",
      es: "Algo salió mal. Inténtalo de nuevo.",
      pt: "Algo deu errado. Tente novamente.",
      fr: "Une erreur s’est produite. Veuillez réessayer.",
      de: "Etwas ist schiefgelaufen. Bitte versuchen Sie es erneut.",
      ru: "Что-то пошло не так. Попробуйте ещё раз."
    },
    pageNotFound: { en: "Page not found", es: "Página no encontrada", pt: "Página não encontrada", fr: "Page introuvable", de: "Seite nicht gefunden", ru: "Страница не найдена" },
    pageNotFoundMessage: {
      en: "The page you are looking for does not exist or has been moved.",
      es: "La página que buscas no existe o se ha movido.",
      pt: "A página que você procura não existe ou foi movida.",
      fr: "La page que vous recherchez n’existe pas ou a été déplacée.",
      de: "Die gesuchte Seite existiert nicht oder wurde verschoben.",
      ru: "Страница, которую вы ищете, не существует или была перемещена."
    },
    backToHome: { en: "Back to the home page", es: "Volver a la página de inicio", pt: "Voltar à página inicial", fr: "Retour à l’accueil", de: "Zurück zur Startseite", ru: "Вернуться на главную" },

    /* ── Footer ── */
    allRightsReserved: {
      en: "All Rights Reserved.",
      es: "Todos los derechos reservados.",
      pt: "Todos os direitos reservados.",
      fr: "Tous droits réservés.",
      de: "Alle Rechte vorbehalten.",
      ru: "Все права защищены."
    },

    /* ── Admin: login ── */
    adminSite:          { en: "Administrative Site", es: "Sitio de administración", pt: "Área administrativa", fr: "Espace d’administration", de: "Verwaltungsbereich", ru: "Панель администратора" },
    username:           { en: "Username", es: "Nombre de usuario", pt: "Nome de usuário", fr: "Nom d’utilisateur", de: "Benutzername", ru: "Имя пользователя" },
    password:           { en: "Password", es: "Contraseña", pt: "Senha", fr: "Mot de passe", de: "Passwort", ru: "Пароль" },
    signIn:             { en: "Sign in", es: "Iniciar sesión", pt: "Entrar", fr: "Se connecter", de: "Anmelden", ru: "Войти" },
    invalidCredentials: { en: "Invalid credentials.", es: "Credenciales no válidas.", pt: "Credenciais inválidas.", fr: "Identifiants incorrects.", de: "Ungültige Anmeldedaten.", ru: "Неверные учётные данные." },
    tooManyAttempts: {
      en: "Too many sign-in attempts. Please wait a few minutes and try again.",
      es: "Demasiados intentos de inicio de sesión. Espera unos minutos e inténtalo de nuevo.",
      pt: "Muitas tentativas de login. Aguarde alguns minutos e tente novamente.",
      fr: "Trop de tentatives de connexion. Veuillez patienter quelques minutes, puis réessayer.",
      de: "Zu viele Anmeldeversuche. Bitte warten Sie einige Minuten und versuchen Sie es erneut.",
      ru: "Слишком много попыток входа. Подождите несколько минут и попробуйте снова."
    },

    /* ── Admin: welcome ── */
    welcomeName:      { en: "Welcome, {name}!", es: "¡Bienvenido, {name}!", pt: "Bem-vindo, {name}!", fr: "Bienvenue, {name}" + NNBSP + "!", de: "Willkommen, {name}!", ru: "Добро пожаловать, {name}!" },
    loadingDashboard: { en: "Loading your dashboard…", es: "Cargando tu panel…", pt: "Carregando seu painel…", fr: "Chargement de votre tableau de bord…", de: "Ihr Dashboard wird geladen…", ru: "Загрузка панели управления…" },

    /* ── Admin: navigation ── */
    viewSite:     { en: "View Site", es: "Ver el sitio", pt: "Ver o site", fr: "Voir le site", de: "Website ansehen", ru: "Открыть сайт" },
    dashboard:    { en: "Dashboard", es: "Panel", pt: "Painel", fr: "Tableau de bord", de: "Dashboard", ru: "Панель управления" },
    posts:        { en: "Posts", es: "Publicaciones", pt: "Publicações", fr: "Publications", de: "Beiträge", ru: "Публикации" },
    siteSettings: { en: "Site Settings", es: "Configuración del sitio", pt: "Configurações do site", fr: "Paramètres du site", de: "Website-Einstellungen", ru: "Настройки сайта" },
    logOut:       { en: "Log out", es: "Cerrar sesión", pt: "Sair", fr: "Se déconnecter", de: "Abmelden", ru: "Выйти" },

    /* ── Admin: dashboard ── */
    totalPosts:   { en: "Total Posts", es: "Total de publicaciones", pt: "Total de publicações", fr: "Total des publications", de: "Beiträge insgesamt", ru: "Всего публикаций" },
    blogPosts:    { en: "Blog Posts", es: "Entradas del blog", pt: "Posts do blog", fr: "Articles de blog", de: "Blogbeiträge", ru: "Записи блога" },
    notices:      { en: "Notices", es: "Avisos", pt: "Avisos", fr: "Annonces", de: "Hinweise", ru: "Объявления" },
    createPost:   { en: "Create Post", es: "Crear publicación", pt: "Criar publicação", fr: "Créer une publication", de: "Beitrag erstellen", ru: "Создать публикацию" },
    managePosts:  { en: "Manage Posts", es: "Administrar publicaciones", pt: "Gerenciar publicações", fr: "Gérer les publications", de: "Beiträge verwalten", ru: "Управление публикациями" },
    changesSaved: { en: "Changes saved successfully.", es: "Los cambios se guardaron correctamente.", pt: "Alterações salvas com sucesso.", fr: "Modifications enregistrées.", de: "Änderungen gespeichert.", ru: "Изменения сохранены." },

    /* ── Admin: posts list ── */
    all:     { en: "All", es: "Todas", pt: "Todas", fr: "Toutes", de: "Alle", ru: "Все" },
    edit:    { en: "Edit", es: "Editar", pt: "Editar", fr: "Modifier", de: "Bearbeiten", ru: "Изменить" },
    delete_: { en: "Delete", es: "Eliminar", pt: "Excluir", fr: "Supprimer", de: "Löschen", ru: "Удалить" },
    deletePostConfirm:  { en: "Delete this post?", es: "¿Eliminar esta publicación?", pt: "Excluir esta publicação?", fr: "Supprimer cette publication" + NNBSP + "?", de: "Diesen Beitrag löschen?", ru: "Удалить эту публикацию?" },
    deletePostQuestion: {
      en: "Are you sure you want to delete this post?",
      es: "¿Seguro que quieres eliminar esta publicación?",
      pt: "Tem certeza de que deseja excluir esta publicação?",
      fr: "Voulez-vous vraiment supprimer cette publication" + NNBSP + "?",
      de: "Möchten Sie diesen Beitrag wirklich löschen?",
      ru: "Вы уверены, что хотите удалить эту публикацию?"
    },
    editor:  { en: "Editor", es: "Editor", pt: "Editor", fr: "Éditeur", de: "Editor", ru: "Редактор" },
    pdf:     { en: "PDF", es: "PDF", pt: "PDF", fr: "PDF", de: "PDF", ru: "PDF" },
    readsCount: {
      en: { one: "{n} read", other: "{n} reads" },
      es: { one: "{n} lectura", other: "{n} lecturas" },
      pt: { one: "{n} leitura", other: "{n} leituras" },
      fr: { one: "{n} lecture", other: "{n} lectures" },
      de: { one: "{n}-mal gelesen", other: "{n}-mal gelesen" },
      ru: { one: "{n} прочтение", few: "{n} прочтения", many: "{n} прочтений", other: "{n} прочтения" }
    },
    sharesCount: {
      en: { one: "{n} share", other: "{n} shares" },
      es: { one: "compartida {n} vez", other: "compartida {n} veces" },
      pt: { one: "{n} compartilhamento", other: "{n} compartilhamentos" },
      fr: { one: "{n} partage", other: "{n} partages" },
      de: { one: "{n}-mal geteilt", other: "{n}-mal geteilt" },
      ru: { one: "{n} репост", few: "{n} репоста", many: "{n} репостов", other: "{n} репоста" }
    },

    /* ── Admin: post form ── */
    editPost:    { en: "Edit Post", es: "Editar publicación", pt: "Editar publicação", fr: "Modifier la publication", de: "Beitrag bearbeiten", ru: "Редактировать публикацию" },
    type:        { en: "Type", es: "Tipo", pt: "Tipo", fr: "Type", de: "Typ", ru: "Тип" },
    choose:      { en: "Choose…", es: "Elegir…", pt: "Selecione…", fr: "Choisir…", de: "Auswählen…", ru: "Выберите…" },
    postDate:    { en: "Post date", es: "Fecha de publicación", pt: "Data de publicação", fr: "Date de publication", de: "Veröffentlichungsdatum", ru: "Дата публикации" },
    title:       { en: "Title", es: "Título", pt: "Título", fr: "Titre", de: "Titel", ru: "Заголовок" },
    contentMode: { en: "Content mode", es: "Modo de contenido", pt: "Modo de conteúdo", fr: "Mode de contenu", de: "Inhaltsmodus", ru: "Режим содержимого" },
    pdfUpload:   { en: "PDF Upload", es: "Subir PDF", pt: "Enviar PDF", fr: "Importer un PDF", de: "PDF hochladen", ru: "Загрузка PDF" },
    regenSlug:   { en: "Regenerate URL slug", es: "Regenerar el slug de la URL", pt: "Regenerar o slug da URL", fr: "Régénérer le slug de l’URL", de: "URL-Slug neu erzeugen", ru: "Пересоздать адрес (slug)" },
    updateUrlOnTitleChange: { en: "Update URL when title changes", es: "Actualizar la URL cuando cambie el título", pt: "Atualizar a URL quando o título mudar", fr: "Mettre à jour l’URL quand le titre change", de: "URL bei Titeländerung aktualisieren", ru: "Обновлять адрес при изменении заголовка" },
    postContent: { en: "Post content", es: "Contenido de la publicación", pt: "Conteúdo da publicação", fr: "Contenu de la publication", de: "Beitragsinhalt", ru: "Текст публикации" },
    pdfFile:     { en: "PDF file", es: "Archivo PDF", pt: "Arquivo PDF", fr: "Fichier PDF", de: "PDF-Datei", ru: "Файл PDF" },
    pdfUploadHint: {
      en: "Upload a PDF. Text will be extracted and placed into an editor below for formatting.",
      es: "Sube un PDF. El texto se extraerá y se colocará en el editor de abajo para darle formato.",
      pt: "Envie um PDF. O texto será extraído e colocado no editor abaixo para formatação.",
      fr: "Importez un PDF. Le texte sera extrait et placé dans l’éditeur ci-dessous pour la mise en forme.",
      de: "Laden Sie ein PDF hoch. Der Text wird extrahiert und zur Formatierung in den Editor unten eingefügt.",
      ru: "Загрузите PDF. Текст будет извлечён и помещён в редактор ниже для оформления."
    },
    extractedContent: { en: "Extracted content (edit below)", es: "Contenido extraído (edítalo abajo)", pt: "Conteúdo extraído (edite abaixo)", fr: "Contenu extrait (modifiable ci-dessous)", de: "Extrahierter Inhalt (unten bearbeiten)", ru: "Извлечённый текст (редактируйте ниже)" },
    formatExtractedText: {
      en: "Format the extracted text using the toolbar above. This will be saved as the post content.",
      es: "Da formato al texto extraído con la barra de herramientas de arriba. Se guardará como contenido de la publicación.",
      pt: "Formate o texto extraído usando a barra de ferramentas acima. Ele será salvo como conteúdo da publicação.",
      fr: "Mettez en forme le texte extrait à l’aide de la barre d’outils ci-dessus. Il sera enregistré comme contenu de la publication.",
      de: "Formatieren Sie den extrahierten Text mit der Symbolleiste oben. Er wird als Beitragsinhalt gespeichert.",
      ru: "Отформатируйте извлечённый текст с помощью панели инструментов выше. Он будет сохранён как текст публикации."
    },
    autoTranslateTitle: {
      en: "Auto Translation for Title",
      es: "Traducción automática del título",
      pt: "Tradução automática do título",
      fr: "Traduction automatique du titre",
      de: "Automatische Übersetzung des Titels",
      ru: "Автоматический перевод заголовка"
    },
    save:     { en: "Save", es: "Guardar", pt: "Salvar", fr: "Enregistrer", de: "Speichern", ru: "Сохранить" },
    cancel:   { en: "Cancel", es: "Cancelar", pt: "Cancelar", fr: "Annuler", de: "Abbrechen", ru: "Отмена" },
    required: { en: "Required", es: "Obligatorio", pt: "Obrigatório", fr: "Obligatoire", de: "Erforderlich", ru: "Обязательное поле" },
    requiredEditorMode: {
      en: "Required in Editor mode",
      es: "Obligatorio en el modo Editor",
      pt: "Obrigatório no modo Editor",
      fr: "Obligatoire en mode Éditeur",
      de: "Im Editor-Modus erforderlich",
      ru: "Обязательно в режиме редактора"
    },
    errChooseType:      { en: "Choose a post type.", es: "Elige un tipo de publicación.", pt: "Escolha um tipo de publicação.", fr: "Choisissez un type de publication.", de: "Wählen Sie einen Beitragstyp.", ru: "Выберите тип публикации." },
    errTitleRequired:   { en: "Title is required.", es: "El título es obligatorio.", pt: "O título é obrigatório.", fr: "Le titre est obligatoire.", de: "Ein Titel ist erforderlich.", ru: "Укажите заголовок." },
    errInvalidDate:     { en: "Invalid date.", es: "Fecha no válida.", pt: "Data inválida.", fr: "Date non valide.", de: "Ungültiges Datum.", ru: "Неверная дата." },
    errPdfRequired:     { en: "PDF file is required for PDF mode.", es: "En el modo PDF se necesita un archivo PDF.", pt: "No modo PDF é necessário um arquivo PDF.", fr: "Un fichier PDF est requis en mode PDF.", de: "Im PDF-Modus ist eine PDF-Datei erforderlich.", ru: "В режиме PDF нужен файл PDF." },
    errContentRequired: { en: "Content is required in editor mode.", es: "El contenido es obligatorio en el modo Editor.", pt: "O conteúdo é obrigatório no modo Editor.", fr: "Le contenu est obligatoire en mode Éditeur.", de: "Im Editor-Modus ist Inhalt erforderlich.", ru: "В режиме редактора нужен текст публикации." },
    errSaveFailed:      { en: "The post could not be saved. Please try again.", es: "No se pudo guardar la publicación. Inténtalo de nuevo.", pt: "Não foi possível salvar a publicação. Tente novamente.", fr: "La publication n’a pas pu être enregistrée. Veuillez réessayer.", de: "Der Beitrag konnte nicht gespeichert werden. Bitte versuchen Sie es erneut.", ru: "Не удалось сохранить публикацию. Попробуйте ещё раз." },
    pdfExtracting:       { en: "Extracting text from PDF…", es: "Extrayendo el texto del PDF…", pt: "Extraindo o texto do PDF…", fr: "Extraction du texte du PDF…", de: "Text wird aus dem PDF extrahiert…", ru: "Извлечение текста из PDF…" },
    pdfExtracted:        { en: "Text extracted. Edit the content below.", es: "Texto extraído. Edita el contenido abajo.", pt: "Texto extraído. Edite o conteúdo abaixo.", fr: "Texte extrait. Modifiez le contenu ci-dessous.", de: "Text extrahiert. Bearbeiten Sie den Inhalt unten.", ru: "Текст извлечён. Отредактируйте его ниже." },
    pdfReplacedKeptText: { en: "PDF replaced. Existing content preserved.", es: "PDF reemplazado. Se conservó el contenido existente.", pt: "PDF substituído. O conteúdo existente foi mantido.", fr: "PDF remplacé. Le contenu existant a été conservé.", de: "PDF ersetzt. Der vorhandene Inhalt wurde beibehalten.", ru: "PDF заменён. Текущий текст сохранён." },
    pdfExtractFailed:    { en: "Failed to extract PDF text. Please try again.", es: "No se pudo extraer el texto del PDF. Inténtalo de nuevo.", pt: "Não foi possível extrair o texto do PDF. Tente novamente.", fr: "Impossible d’extraire le texte du PDF. Veuillez réessayer.", de: "Der Text konnte nicht aus dem PDF extrahiert werden. Bitte versuchen Sie es erneut.", ru: "Не удалось извлечь текст из PDF. Попробуйте ещё раз." },
    pdfNoText:           { en: "No selectable text was found in this PDF.", es: "No se encontró texto seleccionable en este PDF.", pt: "Nenhum texto selecionável foi encontrado neste PDF.", fr: "Aucun texte sélectionnable n’a été trouvé dans ce PDF.", de: "In diesem PDF wurde kein markierbarer Text gefunden.", ru: "В этом PDF не найден текст, который можно выделить." },
    pdfNotPdf:           { en: "Only PDF files can be uploaded.", es: "Solo se pueden subir archivos PDF.", pt: "Somente arquivos PDF podem ser enviados.", fr: "Seuls les fichiers PDF peuvent être importés.", de: "Es können nur PDF-Dateien hochgeladen werden.", ru: "Можно загружать только файлы PDF." },
    pdfTooLarge:         { en: "The PDF is larger than 15 MB.", es: "El PDF supera los 15 MB.", pt: "O PDF tem mais de 15 MB.", fr: "Le PDF dépasse 15" + NNBSP + "Mo.", de: "Das PDF ist größer als 15 MB.", ru: "Размер PDF превышает 15 МБ." },
    confirmSwitchToEditor: {
      en: "Switching to Editor mode removes the original PDF from this post when you save. Continue?",
      es: "Al cambiar al modo Editor, el PDF original se quitará de esta publicación cuando guardes. ¿Continuar?",
      pt: "Ao mudar para o modo Editor, o PDF original será removido desta publicação quando você salvar. Continuar?",
      fr: "Si vous passez en mode Éditeur, le PDF original sera retiré de cette publication à l’enregistrement. Continuer" + NNBSP + "?",
      de: "Beim Wechsel in den Editor-Modus wird das Original-PDF beim Speichern aus diesem Beitrag entfernt. Fortfahren?",
      ru: "При переключении в режим редактора исходный PDF будет удалён из публикации после сохранения. Продолжить?"
    },
    autoFormat: { en: "Auto format", es: "Formato automático", pt: "Formatação automática", fr: "Mise en forme automatique", de: "Automatisch formatieren", ru: "Автоформатирование" },
    autoFormatHint: {
      en: "Tidies paragraph spacing, keeps verse lines together and formats the references. The words are not changed.",
      es: "Ordena el espaciado de los párrafos, mantiene juntos los versos y da formato a las referencias. Las palabras no cambian.",
      pt: "Organiza o espaçamento dos parágrafos, mantém os versos juntos e formata as referências. As palavras não são alteradas.",
      fr: "Harmonise l’espacement des paragraphes, garde les vers ensemble et met en forme les références. Les mots ne sont pas modifiés.",
      de: "Ordnet die Absatzabstände, hält Verszeilen zusammen und formatiert die Quellenangaben. Der Wortlaut bleibt unverändert.",
      ru: "Выравнивает интервалы между абзацами, сохраняет стихотворные строки вместе и оформляет список литературы. Текст не меняется."
    },
    autoFormatting: { en: "Formatting…", es: "Aplicando formato…", pt: "Formatando…", fr: "Mise en forme…", de: "Wird formatiert…", ru: "Форматирование…" },
    autoFormatted: {
      en: "Formatted. Press Ctrl+Z (⌘Z on a Mac) to undo.",
      es: "Formato aplicado. Pulsa Ctrl+Z (⌘Z en Mac) para deshacerlo.",
      pt: "Formatação aplicada. Pressione Ctrl+Z (⌘Z no Mac) para desfazer.",
      fr: "Mise en forme appliquée. Appuyez sur Ctrl+Z (⌘Z sur Mac) pour annuler.",
      de: "Formatiert. Mit Strg+Z (⌘Z auf dem Mac) rückgängig machen.",
      ru: "Отформатировано. Нажмите Ctrl+Z (⌘Z на Mac), чтобы отменить."
    },
    autoFormatNoChange: { en: "The formatting is already consistent.", es: "El formato ya es uniforme.", pt: "A formatação já está uniforme.", fr: "La mise en forme est déjà homogène.", de: "Die Formatierung ist bereits einheitlich.", ru: "Оформление уже единообразно." },
    autoFormatEmpty: { en: "There is nothing to format yet.", es: "Todavía no hay nada que formatear.", pt: "Ainda não há nada para formatar.", fr: "Il n’y a encore rien à mettre en forme.", de: "Es gibt noch nichts zu formatieren.", ru: "Пока нечего форматировать." },
    autoFormatFailed: {
      en: "The text could not be formatted. Please try again.",
      es: "No se pudo dar formato al texto. Inténtalo de nuevo.",
      pt: "Não foi possível formatar o texto. Tente novamente.",
      fr: "Le texte n’a pas pu être mis en forme. Veuillez réessayer.",
      de: "Der Text konnte nicht formatiert werden. Bitte versuchen Sie es erneut.",
      ru: "Не удалось отформатировать текст. Попробуйте ещё раз."
    },

    /* ── Admin: site settings ── */
    homePageText: { en: "Home Page Text", es: "Texto de la página de inicio", pt: "Texto da página inicial", fr: "Texte de la page d’accueil", de: "Text der Startseite", ru: "Текст главной страницы" },
    noticesMax3:  { en: "Notices (max 3)", es: "Avisos (máx. 3)", pt: "Avisos (máx. 3)", fr: "Annonces (3" + NNBSP + "max.)", de: "Hinweise (max. 3)", ru: "Объявления (не более 3)" },
    addNotice:    { en: "Add Notice", es: "Añadir aviso", pt: "Adicionar aviso", fr: "Ajouter une annonce", de: "Hinweis hinzufügen", ru: "Добавить объявление" },
    addNoticePlaceholder: { en: "Add a notice…", es: "Escribe un aviso…", pt: "Escreva um aviso…", fr: "Saisissez une annonce…", de: "Hinweis eingeben…", ru: "Введите объявление…" },
    maxNoticesReached: {
      en: "Maximum of 3 notices reached.",
      es: "Se alcanzó el máximo de 3 avisos.",
      pt: "O limite de 3 avisos foi atingido.",
      fr: "Le maximum de 3 annonces est atteint.",
      de: "Die Höchstzahl von 3 Hinweisen ist erreicht.",
      ru: "Достигнуто максимальное число объявлений (3)."
    },
    deleteNoticeConfirm: { en: "Delete this notice?", es: "¿Eliminar este aviso?", pt: "Excluir este aviso?", fr: "Supprimer cette annonce" + NNBSP + "?", de: "Diesen Hinweis löschen?", ru: "Удалить это объявление?" },

    /* ── Subscribe ── */
    subscribe: { en: "Subscribe", es: "Suscribirse", pt: "Inscrever-se", fr: "S’abonner", de: "Abonnieren", ru: "Подписаться" },
    stayUpdated: {
      en: "Stay updated on our latest posts?",
      es: "¿Quieres estar al día con nuestras últimas publicaciones?",
      pt: "Quer ficar por dentro das nossas últimas publicações?",
      fr: "Vous souhaitez être informé de nos dernières publications" + NNBSP + "?",
      de: "Möchten Sie über unsere neuesten Beiträge informiert bleiben?",
      ru: "Хотите узнавать о наших новых публикациях?"
    },
    enterEmail: {
      en: "Enter your email address",
      es: "Introduce tu correo electrónico",
      pt: "Digite seu endereço de e-mail",
      fr: "Saisissez votre adresse e-mail",
      de: "Geben Sie Ihre E-Mail-Adresse ein",
      ru: "Введите адрес электронной почты"
    },
    invalidEmail: {
      en: "Invalid email",
      es: "Correo electrónico no válido",
      pt: "E-mail inválido",
      fr: "Adresse e-mail non valide",
      de: "Ungültige E-Mail-Adresse",
      ru: "Неверный адрес электронной почты"
    },
    alreadySubscribed: {
      en: "Oops! You are already subscribed",
      es: "¡Vaya! Ya estás suscrito",
      pt: "Ops! Você já está inscrito",
      fr: "Oups" + NNBSP + "! Vous êtes déjà abonné",
      de: "Hoppla! Sie haben bereits ein Abonnement",
      ru: "Ой! Вы уже подписаны"
    },
    subscribeThankYou: {
      en: "Thank you for subscribing to The Augustine Journal. You may unsubscribe at any time in your email.",
      es: "Gracias por suscribirte al Diario Agustiniano. Puedes cancelar tu suscripción en cualquier momento desde nuestros correos.",
      pt: "Obrigado por se inscrever no Diário Agostiniano. Você pode cancelar sua inscrição a qualquer momento pelos nossos e-mails.",
      fr: "Merci de vous être abonné au Journal augustinien. Vous pouvez vous désabonner à tout moment depuis nos e-mails.",
      de: "Vielen Dank für Ihr Abonnement des Augustinischen Journals. Sie können es jederzeit über den Link in unseren E-Mails beenden.",
      ru: "Спасибо за подписку на «Августинский журнал». Отписаться можно в любой момент по ссылке в наших письмах."
    },
    subscribed: { en: "Subscribed!", es: "¡Suscrito!", pt: "Inscrito!", fr: "Abonné" + NNBSP + "!", de: "Abonniert!", ru: "Вы подписаны!" },

    /* ── Admin: subscribers ── */
    subscribers: { en: "Subscribers", es: "Suscriptores", pt: "Inscritos", fr: "Abonnés", de: "Abonnenten", ru: "Подписчики" },
    subscriberCount: {
      en: { one: "{n} subscriber", other: "{n} subscribers" },
      es: { one: "{n} suscriptor", other: "{n} suscriptores" },
      pt: { one: "{n} inscrito", other: "{n} inscritos" },
      fr: { one: "{n} abonné", other: "{n} abonnés" },
      de: { one: "{n} Abonnent", other: "{n} Abonnenten" },
      ru: { one: "{n} подписчик", few: "{n} подписчика", many: "{n} подписчиков", other: "{n} подписчика" }
    },
    noSubscribers: {
      en: "No subscribers yet.",
      es: "Todavía no hay suscriptores.",
      pt: "Ainda não há inscritos.",
      fr: "Aucun abonné pour le moment.",
      de: "Noch keine Abonnenten.",
      ru: "Подписчиков пока нет."
    },
    unsubscribe: { en: "Unsubscribe", es: "Cancelar suscripción", pt: "Cancelar inscrição", fr: "Désabonner", de: "Abonnement beenden", ru: "Отписать" },
    removeSubscriberConfirm: {
      en: "Are you sure you want to remove {email} from subscribers?",
      es: "¿Seguro que quieres eliminar a {email} de los suscriptores?",
      pt: "Tem certeza de que deseja remover {email} dos inscritos?",
      fr: "Voulez-vous vraiment retirer {email} des abonnés" + NNBSP + "?",
      de: "Möchten Sie {email} wirklich aus der Abonnentenliste entfernen?",
      ru: "Вы уверены, что хотите удалить {email} из подписчиков?"
    },
    confirm: { en: "Confirm", es: "Confirmar", pt: "Confirmar", fr: "Confirmer", de: "Bestätigen", ru: "Подтвердить" },
    enterAdminPassword: {
      en: "Please enter administrative password",
      es: "Introduce la contraseña de administrador",
      pt: "Digite a senha de administrador",
      fr: "Veuillez saisir le mot de passe administrateur",
      de: "Bitte geben Sie das Administratorpasswort ein",
      ru: "Введите пароль администратора"
    },
    incorrectPassword: {
      en: "Incorrect password.",
      es: "Contraseña incorrecta.",
      pt: "Senha incorreta.",
      fr: "Mot de passe incorrect.",
      de: "Falsches Passwort.",
      ru: "Неверный пароль."
    },
    sessionExpired: {
      en: "Your session has expired. Please sign in again.",
      es: "Tu sesión ha caducado. Vuelve a iniciar sesión.",
      pt: "Sua sessão expirou. Entre novamente.",
      fr: "Votre session a expiré. Veuillez vous reconnecter.",
      de: "Ihre Sitzung ist abgelaufen. Bitte melden Sie sich erneut an.",
      ru: "Сеанс истёк. Войдите снова."
    },
    actionFailed: {
      en: "The action could not be completed. Please try again.",
      es: "No se pudo completar la acción. Inténtalo de nuevo.",
      pt: "Não foi possível concluir a ação. Tente novamente.",
      fr: "L’action n’a pas pu être effectuée. Veuillez réessayer.",
      de: "Die Aktion konnte nicht ausgeführt werden. Bitte versuchen Sie es erneut.",
      ru: "Не удалось выполнить действие. Попробуйте ещё раз."
    },

    /* ── Site title ── */
    siteTitle: {
      en: "The Augustine Journal",
      es: "El Diario Agustiniano",
      pt: "O Diário Agostiniano",
      fr: "Le Journal augustinien",
      de: "Das Augustinische Journal",
      ru: "Августинский журнал"
    }
  };

  /* ===== Language detection ===== */

  /**
   * The visitor's language: the first supported entry of the browser's
   * language list, then the server's reading of the Accept-Language header.
   */
  function detectBestLang() {
    var languages = navigator.languages && navigator.languages.length
      ? Array.prototype.slice.call(navigator.languages)
      : [navigator.language || navigator.userLanguage || "en"];

    for (var i = 0; i < languages.length; i++) {
      var base = String(languages[i] || "").toLowerCase().split("-")[0];
      if (SUPPORTED.indexOf(base) !== -1) return base;
    }

    var meta = document.querySelector('meta[name="detected-lang"]');
    if (meta) {
      var serverLang = (meta.getAttribute("content") || "").toLowerCase().split("-")[0];
      if (SUPPORTED.indexOf(serverLang) !== -1) return serverLang;
    }

    return SITE_LANG;
  }

  var lang = SITE_LANG;

  function t(key, fallback) {
    var map = ui[key];
    if (!map) return fallback !== undefined ? fallback : key;
    var value = map[lang] !== undefined ? map[lang] : map.en;
    return typeof value === "string" ? value : fallback !== undefined ? fallback : key;
  }

  function format(template, vars) {
    return String(template).replace(/\{(\w+)\}/g, function (m, name) {
      return vars && vars[name] !== undefined ? String(vars[name]) : m;
    });
  }

  function plural(key, n) {
    var map = ui[key];
    if (!map) return String(n);
    var forms = map[lang] || map.en;
    var category = "other";
    try { category = new Intl.PluralRules(LOCALES[lang]).select(n); } catch (e) { category = n === 1 ? "one" : "other"; }
    var number = n;
    try { number = new Intl.NumberFormat(LOCALES[lang]).format(n); } catch (e) { /* keep plain */ }
    return format(forms[category] || forms.other, { n: number });
  }

  function each(selector, fn) {
    var nodes = document.querySelectorAll(selector);
    for (var i = 0; i < nodes.length; i++) fn(nodes[i]);
  }

  /* ===== Dictionary text, attributes, dates and counts ===== */
  function translateInterface() {
    each("[data-i18n]", function (el) {
      var key = el.getAttribute("data-i18n");
      if (ui[key]) el.textContent = t(key);
    });
    each("[data-i18n-placeholder]", function (el) {
      var key = el.getAttribute("data-i18n-placeholder");
      if (ui[key]) el.setAttribute("placeholder", t(key));
    });
    each("[data-i18n-aria-label]", function (el) {
      var key = el.getAttribute("data-i18n-aria-label");
      if (ui[key]) el.setAttribute("aria-label", t(key));
    });
    each("[data-i18n-title]", function (el) {
      var key = el.getAttribute("data-i18n-title");
      if (ui[key]) el.setAttribute("title", t(key));
    });
    each("[data-i18n-template]", function (el) {
      var key = el.getAttribute("data-i18n-template");
      if (!ui[key]) return;
      var vars = {};
      for (var i = 0; i < el.attributes.length; i++) {
        var a = el.attributes[i];
        if (a.name.indexOf("data-var-") === 0) vars[a.name.slice(9)] = a.value;
      }
      el.textContent = format(t(key), vars);
    });
    each("[data-i18n-count]", function (el) {
      var n = Number(el.getAttribute("data-count"));
      if (!isNaN(n)) el.textContent = plural(el.getAttribute("data-i18n-count"), n);
    });
    each("time[data-i18n-date]", function (el) {
      var iso = el.getAttribute("datetime");
      if (!iso) return;
      var date = new Date(iso.length === 10 ? iso + "T00:00:00Z" : iso);
      if (isNaN(date.getTime())) return;
      var style = el.getAttribute("data-i18n-date") === "short" ? "short" : "long";
      try {
        el.textContent = new Intl.DateTimeFormat(LOCALES[lang], { year: "numeric", month: style, day: "numeric", timeZone: "UTC" }).format(date);
      } catch (e) { /* keep the English date */ }
    });
  }

  /* Confirmation prompts on forms (inline handlers are blocked by the CSP). */
  function wireConfirmPrompts() {
    each("form[data-i18n-confirm]", function (form) {
      form.addEventListener("submit", function (e) {
        if (!window.confirm(t(form.getAttribute("data-i18n-confirm")))) e.preventDefault();
      });
    });
  }

  /* ===== Document title ===== */
  function updateDocumentTitle() {
    var root = document.documentElement;
    var site = t("siteTitle");
    var from = root.getAttribute("data-title-from");
    var key = root.getAttribute("data-title-key");
    if (from) {
      var el = document.querySelector(from);
      if (el && el.textContent.trim()) document.title = el.textContent.trim() + " | " + site;
    } else if (key === "siteTitle") {
      document.title = site;
    } else if (key && ui[key]) {
      document.title = t(key) + " | " + site;
    }
  }

  /* ===== Content from the translation engine ===== */
  var applied = {};
  var pollTimer = null;
  var pollDelay = 2500;
  var pollUntil = 0;

  function revealPage() {
    document.documentElement.classList.remove("i18n-pending");
  }

  function translatableElements() {
    var byKey = {};
    each("[data-translate-key]", function (el) {
      var key = el.getAttribute("data-translate-key");
      if (!key || el.closest("[translate='no'], .notranslate")) return;
      (byKey[key] = byKey[key] || []).push(el);
    });
    return byKey;
  }

  function applyItem(els, item) {
    for (var i = 0; i < els.length; i++) {
      var el = els[i];
      var kind = el.getAttribute("data-translate-kind") || "text";
      if (kind === "html" && typeof item.html === "string") {
        if (applied[el.getAttribute("data-translate-key")] !== item.html || el.getAttribute("data-translated") !== "1") {
          el.innerHTML = item.html;
          el.setAttribute("data-translated", "1");
        }
      } else if (kind === "text" && typeof item.text === "string") {
        el.textContent = item.text;
        el.setAttribute("data-translated", "1");
      }
      if (item.complete) {
        el.setAttribute("lang", lang);
        el.classList.remove("i18n-translating");
      } else {
        el.classList.add("i18n-translating");
      }
    }
  }

  function requestTranslations(keys) {
    var url = "/api/translations?lang=" + encodeURIComponent(lang) + "&keys=" + encodeURIComponent(keys.join(","));
    return fetch(url, { credentials: "same-origin", headers: { Accept: "application/json" } }).then(function (r) {
      if (!r.ok) throw new Error("HTTP " + r.status);
      return r.json();
    });
  }

  function refresh() {
    pollTimer = null;
    var byKey = translatableElements();
    var keys = [];
    for (var k in byKey) {
      if (Object.prototype.hasOwnProperty.call(byKey, k) && applied[k + "#complete"] !== true) keys.push(k);
    }
    if (!keys.length) {
      revealPage();
      return;
    }
    requestTranslations(keys.slice(0, 80))
      .then(function (data) {
        var items = (data && data.items) || {};
        var incomplete = false;
        for (var i = 0; i < keys.length; i++) {
          var key = keys[i];
          var item = items[key];
          if (!item) continue;
          applyItem(byKey[key], item);
          if (typeof item.html === "string") applied[key] = item.html;
          if (item.complete) applied[key + "#complete"] = true;
          else incomplete = true;
        }
        updateDocumentTitle();
        revealPage();
        if (incomplete || keys.length > 80) schedulePoll();
      })
      .catch(function () {
        revealPage();
        schedulePoll();
      });
  }

  /* No more polling: what is not translated by now stays as it is, without the pulse. */
  function stopPulse() {
    each(".i18n-translating", function (el) {
      el.classList.remove("i18n-translating");
    });
  }

  function schedulePoll() {
    if (pollTimer) return;
    if (Date.now() > pollUntil) {
      stopPulse();
      return;
    }
    pollTimer = setTimeout(function () {
      if (document.hidden) {
        pollTimer = null;
        return; /* resumed by visibilitychange */
      }
      refresh();
    }, pollDelay);
    pollDelay = Math.min(15000, Math.round(pollDelay * 1.4));
  }

  document.addEventListener("visibilitychange", function () {
    if (document.hidden || lang === SITE_LANG || pollTimer) return;
    if (Date.now() < pollUntil) refresh();
    else stopPulse();
  });

  /* ===== Leftovers from the old Google Translate widget ===== */
  function clearLegacyTranslateCookies() {
    try {
      if (document.cookie.indexOf("googtrans") === -1) return;
      var expire = "=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/";
      document.cookie = "googtrans" + expire;
      document.cookie = "googtrans" + expire + "; domain=." + location.hostname;
    } catch (e) { /* cookies unavailable (sandboxed page) */ }
  }

  /* ===== Expose the language for other scripts (share button, forms) ===== */
  window.__i18nLang = SITE_LANG;
  window.__i18nUi = ui;
  window.__i18nT = function (key, vars) { return format(t(key), vars); };

  function init() {
    clearLegacyTranslateCookies();
    wireConfirmPrompts();

    lang = detectBestLang();
    window.__i18nLang = lang;

    if (lang === SITE_LANG) {
      revealPage();
      return;
    }

    document.documentElement.setAttribute("lang", lang);
    translateInterface();
    updateDocumentTitle();

    /* Text still in English keeps its own language tag for screen readers;
       content gets the visitor's language once its translation is complete.
       (Admin forms marked translate="no" have translated labels inside.) */
    each("[translate='no'], [data-translate-key]", function (el) {
      if (el.hasAttribute("lang")) return;
      if (el.getAttribute("translate") === "no" && el.querySelector("[data-i18n]")) return;
      el.setAttribute("lang", "en");
    });

    pollUntil = Date.now() + 15 * 60 * 1000;
    refresh();
  }

  if (document.readyState === "loading") document.addEventListener("DOMContentLoaded", init);
  else init();
})();
