(function () {
  "use strict";

  var SITE_LANG = "en";
  var SUPPORTED = ["en", "pt", "es", "fr", "de", "it"];

  /* ===== UI string translations (static labels) ===== */
  var ui = {
    /* ── Public navigation ── */
    home:        { en: "Home",    pt: "In\u00edcio",  es: "Inicio",   fr: "Accueil",    de: "Startseite", it: "Home" },
    blog:        { en: "Blog",    pt: "Blog",         es: "Blog",     fr: "Blog",       de: "Blog",        it: "Blog" },
    essays:      { en: "Essays",  pt: "Ensaios",      es: "Ensayos",  fr: "Essais",     de: "Essays",      it: "Saggi" },
    essay:       { en: "Essay",   pt: "Ensaio",       es: "Ensayo",   fr: "Essai",      de: "Essay",       it: "Saggio" },
    letters:     { en: "Letters", pt: "Cartas",       es: "Cartas",   fr: "Lettres",    de: "Briefe",      it: "Lettere" },
    letter:      { en: "Letter",  pt: "Carta",        es: "Carta",    fr: "Lettre",     de: "Brief",       it: "Lettera" },

    /* ── Public content labels ── */
    checkLatest: {
      en: "Check out our latest post",
      pt: "Confira nossa publica\u00e7\u00e3o mais recente",
      es: "Mira nuestra publicaci\u00f3n m\u00e1s reciente",
      fr: "D\u00e9couvrez notre derni\u00e8re publication",
      de: "Schauen Sie sich unseren neuesten Beitrag an",
      it: "Dai un'occhiata al nostro ultimo articolo"
    },
    noPostsYet: {
      en: "No posts yet.",
      pt: "Nenhuma publica\u00e7\u00e3o ainda.",
      es: "No hay publicaciones todav\u00eda.",
      fr: "Aucune publication pour le moment.",
      de: "Noch keine Beitr\u00e4ge.",
      it: "Nessun articolo ancora."
    },
    share:   { en: "Share",             pt: "Compartilhar",       es: "Compartir",          fr: "Partager",             de: "Teilen",               it: "Condividi" },
    viewPdf: { en: "View Original PDF", pt: "Ver PDF Original",   es: "Ver PDF Original",   fr: "Voir le PDF Original", de: "Original-PDF anzeigen", it: "Visualizza PDF Originale" },
    linkCopied: { en: "Link copied!",   pt: "Link copiado!",      es: "\u00a1Enlace copiado!", fr: "Lien copi\u00e9\u00a0!", de: "Link kopiert!",      it: "Link copiato!" },

    /* ── Footer ── */
    allRightsReserved: {
      en: "All Rights Reserved.",
      pt: "Todos os Direitos Reservados.",
      es: "Todos los Derechos Reservados.",
      fr: "Tous Droits R\u00e9serv\u00e9s.",
      de: "Alle Rechte vorbehalten.",
      it: "Tutti i Diritti Riservati."
    },

    /* ── Admin: login ── */
    adminSite:           { en: "Administrative Site",   pt: "Site Administrativo",          es: "Sitio Administrativo",          fr: "Site Administratif",          de: "Verwaltungsseite",            it: "Sito Amministrativo" },
    username:            { en: "Username",              pt: "Nome de usu\u00e1rio",         es: "Nombre de usuario",             fr: "Nom d\u2019utilisateur",      de: "Benutzername",                it: "Nome utente" },
    password:            { en: "Password",              pt: "Senha",                        es: "Contrase\u00f1a",               fr: "Mot de passe",                de: "Passwort",                    it: "Password" },
    signIn:              { en: "Sign in",               pt: "Entrar",                       es: "Iniciar sesi\u00f3n",           fr: "Se connecter",                de: "Anmelden",                    it: "Accedi" },
    invalidCredentials:  { en: "Invalid credentials.",  pt: "Credenciais inv\u00e1lidas.",   es: "Credenciales inv\u00e1lidas.",  fr: "Identifiants invalides.",     de: "Ung\u00fcltige Anmeldedaten.", it: "Credenziali non valide." },

    /* ── Admin: welcome ── */
    welcome:            { en: "Welcome,",               pt: "Bem-vindo,",                   es: "Bienvenido,",                   fr: "Bienvenue,",                  de: "Willkommen,",                 it: "Benvenuto," },
    loadingDashboard:   { en: "Loading your dashboard\u2026", pt: "Carregando seu painel\u2026", es: "Cargando tu panel\u2026",  fr: "Chargement du tableau de bord\u2026", de: "Dashboard wird geladen\u2026", it: "Caricamento della dashboard\u2026" },

    /* ── Admin: navigation ── */
    viewSite:     { en: "View Site",      pt: "Ver Site",           es: "Ver Sitio",          fr: "Voir le Site",        de: "Seite ansehen",       it: "Vedi Sito" },
    dashboard:    { en: "Dashboard",      pt: "Painel",             es: "Panel",              fr: "Tableau de bord",     de: "Dashboard",           it: "Pannello" },
    posts:        { en: "Posts",           pt: "Publica\u00e7\u00f5es", es: "Publicaciones",  fr: "Publications",        de: "Beitr\u00e4ge",       it: "Articoli" },
    siteSettings: { en: "Site Settings",  pt: "Configura\u00e7\u00f5es do Site", es: "Configuraci\u00f3n del Sitio", fr: "Param\u00e8tres du Site", de: "Seiteneinstellungen", it: "Impostazioni Sito" },
    logOut:       { en: "Log out",        pt: "Sair",               es: "Cerrar sesi\u00f3n", fr: "Se d\u00e9connecter", de: "Abmelden",            it: "Esci" },

    /* ── Admin: dashboard ── */
    totalPosts:   { en: "Total Posts",    pt: "Total de Publica\u00e7\u00f5es", es: "Total de Publicaciones", fr: "Total des Publications", de: "Gesamtbeitr\u00e4ge", it: "Totale Articoli" },
    blogPosts:    { en: "Blog Posts",     pt: "Posts do Blog",      es: "Posts del Blog",     fr: "Articles de Blog",    de: "Blog-Beitr\u00e4ge",  it: "Articoli del Blog" },
    notices:      { en: "Notices",        pt: "Avisos",             es: "Avisos",             fr: "Avis",                de: "Hinweise",            it: "Avvisi" },
    createPost:   { en: "Create Post",    pt: "Criar Publica\u00e7\u00e3o", es: "Crear Publicaci\u00f3n", fr: "Cr\u00e9er une Publication", de: "Beitrag erstellen", it: "Crea Articolo" },
    managePosts:  { en: "Manage Posts",   pt: "Gerenciar Publica\u00e7\u00f5es", es: "Administrar Publicaciones", fr: "G\u00e9rer les Publications", de: "Beitr\u00e4ge verwalten", it: "Gestisci Articoli" },
    changesSaved: { en: "Changes saved successfully.", pt: "Altera\u00e7\u00f5es salvas com sucesso.", es: "Cambios guardados correctamente.", fr: "Modifications enregistr\u00e9es avec succ\u00e8s.", de: "\u00c4nderungen erfolgreich gespeichert.", it: "Modifiche salvate con successo." },

    /* ── Admin: posts list ── */
    all:       { en: "All",    pt: "Todos",   es: "Todos",   fr: "Tous",  de: "Alle",  it: "Tutti" },
    edit:      { en: "Edit",   pt: "Editar",  es: "Editar",  fr: "Modifier", de: "Bearbeiten", it: "Modifica" },
    delete_:   { en: "Delete", pt: "Excluir", es: "Eliminar", fr: "Supprimer", de: "L\u00f6schen", it: "Elimina" },
    deletePostConfirm: { en: "Delete this post?", pt: "Excluir esta publica\u00e7\u00e3o?", es: "\u00bfEliminar esta publicaci\u00f3n?", fr: "Supprimer cette publication\u00a0?", de: "Diesen Beitrag l\u00f6schen?", it: "Eliminare questo articolo?" },
    editor:    { en: "Editor", pt: "Editor",  es: "Editor",  fr: "\u00c9diteur", de: "Editor", it: "Editor" },

    /* ── Admin: post form ── */
    editPost:    { en: "Edit Post",     pt: "Editar Publica\u00e7\u00e3o", es: "Editar Publicaci\u00f3n", fr: "Modifier la Publication", de: "Beitrag bearbeiten", it: "Modifica Articolo" },
    type:        { en: "Type",          pt: "Tipo",             es: "Tipo",             fr: "Type",            de: "Typ",              it: "Tipo" },
    choose:      { en: "Choose\u2026",  pt: "Escolha\u2026",    es: "Elegir\u2026",     fr: "Choisir\u2026",   de: "W\u00e4hlen\u2026", it: "Scegli\u2026" },
    postDate:    { en: "Post date",     pt: "Data da publica\u00e7\u00e3o", es: "Fecha de publicaci\u00f3n", fr: "Date de publication", de: "Ver\u00f6ffentlichungsdatum", it: "Data di pubblicazione" },
    title:       { en: "Title",         pt: "T\u00edtulo",      es: "T\u00edtulo",      fr: "Titre",           de: "Titel",            it: "Titolo" },
    contentMode: { en: "Content mode",  pt: "Modo de conte\u00fado", es: "Modo de contenido", fr: "Mode de contenu", de: "Inhaltsmodus", it: "Modalit\u00e0 contenuto" },
    pdfUpload:   { en: "PDF Upload",    pt: "Upload de PDF",    es: "Subir PDF",        fr: "T\u00e9l\u00e9charger PDF", de: "PDF hochladen", it: "Carica PDF" },
    regenSlug:   { en: "Regenerate URL slug", pt: "Regenerar slug da URL", es: "Regenerar slug de URL", fr: "Reg\u00e9n\u00e9rer le slug URL", de: "URL-Slug neu generieren", it: "Rigenera slug URL" },
    updateUrlOnTitleChange: { en: "Update URL when title changes", pt: "Atualizar URL quando o t\u00edtulo mudar", es: "Actualizar URL cuando cambie el t\u00edtulo", fr: "Mettre \u00e0 jour l\u2019URL quand le titre change", de: "URL bei Titel\u00e4nderung aktualisieren", it: "Aggiorna URL quando il titolo cambia" },
    postContent: { en: "Post content",  pt: "Conte\u00fado da publica\u00e7\u00e3o", es: "Contenido de la publicaci\u00f3n", fr: "Contenu de la publication", de: "Beitragsinhalt", it: "Contenuto dell'articolo" },
    pdfFile:     { en: "PDF file",      pt: "Arquivo PDF",      es: "Archivo PDF",      fr: "Fichier PDF",     de: "PDF-Datei",        it: "File PDF" },
    pdfUploadHint: {
      en: "Upload a PDF. Text will be extracted and placed into an editor below for formatting.",
      pt: "Envie um PDF. O texto ser\u00e1 extra\u00eddo e colocado no editor abaixo para formata\u00e7\u00e3o.",
      es: "Sube un PDF. El texto se extraer\u00e1 y se colocar\u00e1 en el editor a continuaci\u00f3n para su formato.",
      fr: "T\u00e9l\u00e9chargez un PDF. Le texte sera extrait et plac\u00e9 dans l\u2019\u00e9diteur ci-dessous pour la mise en forme.",
      de: "Laden Sie ein PDF hoch. Der Text wird extrahiert und im Editor unten zur Formatierung eingef\u00fcgt.",
      it: "Carica un PDF. Il testo verr\u00e0 estratto e inserito nell'editor sottostante per la formattazione."
    },
    extractedContent: { en: "Extracted content (edit below)", pt: "Conte\u00fado extra\u00eddo (edite abaixo)", es: "Contenido extra\u00eddo (editar abajo)", fr: "Contenu extrait (modifier ci-dessous)", de: "Extrahierter Inhalt (unten bearbeiten)", it: "Contenuto estratto (modifica sotto)" },
    formatExtractedText: {
      en: "Format the extracted text using the toolbar above. This will be saved as the post content.",
      pt: "Formate o texto extra\u00eddo usando a barra de ferramentas acima. Isto ser\u00e1 salvo como conte\u00fado da publica\u00e7\u00e3o.",
      es: "Formatea el texto extra\u00eddo usando la barra de herramientas de arriba. Esto se guardar\u00e1 como contenido de la publicaci\u00f3n.",
      fr: "Mettez en forme le texte extrait \u00e0 l\u2019aide de la barre d\u2019outils ci-dessus. Il sera enregistr\u00e9 comme contenu de la publication.",
      de: "Formatieren Sie den extrahierten Text mit der Symbolleiste oben. Dieser wird als Beitragsinhalt gespeichert.",
      it: "Formatta il testo estratto utilizzando la barra degli strumenti sopra. Verr\u00e0 salvato come contenuto dell'articolo."
    },
    autoTranslateTitle: {
      en: "Auto Translation for Title",
      pt: "Tradu\u00e7\u00e3o Autom\u00e1tica do T\u00edtulo",
      es: "Traducci\u00f3n Autom\u00e1tica del T\u00edtulo",
      fr: "Traduction Automatique du Titre",
      de: "Automatische Titel\u00fcbersetzung",
      it: "Traduzione Automatica del Titolo"
    },
    save:     { en: "Save",   pt: "Salvar",    es: "Guardar",    fr: "Enregistrer",  de: "Speichern",  it: "Salva" },
    cancel:   { en: "Cancel", pt: "Cancelar",  es: "Cancelar",   fr: "Annuler",      de: "Abbrechen",  it: "Annulla" },
    required: { en: "Required", pt: "Obrigat\u00f3rio", es: "Obligatorio", fr: "Obligatoire", de: "Erforderlich", it: "Obbligatorio" },
    requiredEditorMode: {
      en: "Required in Editor mode",
      pt: "Obrigat\u00f3rio no modo Editor",
      es: "Obligatorio en modo Editor",
      fr: "Obligatoire en mode \u00c9diteur",
      de: "Erforderlich im Editor-Modus",
      it: "Obbligatorio in modalit\u00e0 Editor"
    },

    /* ── Admin: site settings ── */
    homePageText:  { en: "Home Page Text",       pt: "Texto da P\u00e1gina Inicial", es: "Texto de la P\u00e1gina de Inicio", fr: "Texte de la Page d\u2019Accueil", de: "Startseitentext", it: "Testo della Pagina Iniziale" },
    noticesMax3:   { en: "Notices (max 3)",       pt: "Avisos (m\u00e1x 3)",         es: "Avisos (m\u00e1x 3)",               fr: "Avis (max 3)",                    de: "Hinweise (max 3)",  it: "Avvisi (max 3)" },
    addNotice:     { en: "Add Notice",            pt: "Adicionar Aviso",              es: "Agregar Aviso",                     fr: "Ajouter un Avis",                 de: "Hinweis hinzuf\u00fcgen", it: "Aggiungi Avviso" },
    addNoticePlaceholder: { en: "Add a notice\u2026", pt: "Adicionar um aviso\u2026", es: "Agregar un aviso\u2026",          fr: "Ajouter un avis\u2026",            de: "Hinweis hinzuf\u00fcgen\u2026", it: "Aggiungi un avviso\u2026" },
    maxNoticesReached: {
      en: "Maximum of 3 notices reached.",
      pt: "M\u00e1ximo de 3 avisos atingido.",
      es: "Se alcanz\u00f3 el m\u00e1ximo de 3 avisos.",
      fr: "Maximum de 3 avis atteint.",
      de: "Maximum von 3 Hinweisen erreicht.",
      it: "Massimo di 3 avvisi raggiunto."
    },
    deleteNoticeConfirm: { en: "Delete this notice?", pt: "Excluir este aviso?", es: "\u00bfEliminar este aviso?", fr: "Supprimer cet avis\u00a0?", de: "Diesen Hinweis l\u00f6schen?", it: "Eliminare questo avviso?" },

    /* ── Subscribe ── */
    subscribe: {
      en: "Subscribe", pt: "Inscrever-se", es: "Suscribirse",
      fr: "S'abonner", de: "Abonnieren", it: "Iscriviti"
    },
    stayUpdated: {
      en: "Stay updated on our latest posts?",
      pt: "Fique atualizado sobre nossas \u00faltimas publica\u00e7\u00f5es?",
      es: "\u00bfMant\u00e9nte al d\u00eda con nuestras \u00faltimas publicaciones?",
      fr: "Restez inform\u00e9 de nos derni\u00e8res publications\u00a0?",
      de: "Bleiben Sie \u00fcber unsere neuesten Beitr\u00e4ge auf dem Laufenden?",
      it: "Resta aggiornato sui nostri ultimi articoli?"
    },
    enterEmail: {
      en: "Enter your email address",
      pt: "Digite seu endere\u00e7o de email",
      es: "Ingresa tu correo electr\u00f3nico",
      fr: "Entrez votre adresse e-mail",
      de: "Geben Sie Ihre E-Mail-Adresse ein",
      it: "Inserisci il tuo indirizzo email"
    },
    invalidEmail: {
      en: "Invalid email",
      pt: "Email inv\u00e1lido",
      es: "Correo electr\u00f3nico no v\u00e1lido",
      fr: "E-mail invalide",
      de: "Ung\u00fcltige E-Mail",
      it: "Email non valida"
    },
    alreadySubscribed: {
      en: "Oops! You are already subscribed",
      pt: "Ops! Voc\u00ea j\u00e1 est\u00e1 inscrito",
      es: "\u00a1Ups! Ya est\u00e1s suscrito",
      fr: "Oups\u00a0! Vous \u00eates d\u00e9j\u00e0 abonn\u00e9",
      de: "Hoppla! Sie sind bereits abonniert",
      it: "Ops! Sei gi\u00e0 iscritto"
    },
    subscribeThankYou: {
      en: "Thank you for subscribing to The Augustine Journal. You may unsubscribe at any time in your email.",
      pt: "Obrigado por se inscrever no The Augustine Journal. Voc\u00ea pode cancelar sua inscri\u00e7\u00e3o a qualquer momento em seu email.",
      es: "Gracias por suscribirte a The Augustine Journal. Puedes cancelar tu suscripci\u00f3n en cualquier momento desde tu correo.",
      fr: "Merci de vous \u00eatre abonn\u00e9 \u00e0 The Augustine Journal. Vous pouvez vous d\u00e9sabonner \u00e0 tout moment dans votre e-mail.",
      de: "Vielen Dank f\u00fcr Ihr Abonnement des The Augustine Journal. Sie k\u00f6nnen sich jederzeit in Ihrer E-Mail abmelden.",
      it: "Grazie per esserti iscritto a The Augustine Journal. Puoi annullare l'iscrizione in qualsiasi momento dalla tua email."
    },

    /* ── Admin: subscribers ── */
    subscribers: {
      en: "Subscribers", pt: "Inscritos", es: "Suscriptores",
      fr: "Abonn\u00e9s", de: "Abonnenten", it: "Iscritti"
    },
    subscriberCount: {
      en: "subscriber(s)", pt: "inscrito(s)", es: "suscriptor(es)",
      fr: "abonn\u00e9(s)", de: "Abonnent(en)", it: "iscritto/i"
    },
    noSubscribers: {
      en: "No subscribers yet.",
      pt: "Nenhum inscrito ainda.",
      es: "No hay suscriptores todav\u00eda.",
      fr: "Aucun abonn\u00e9 pour le moment.",
      de: "Noch keine Abonnenten.",
      it: "Nessun iscritto ancora."
    },

    /* ── Admin: unsubscribe ── */
    unsubscribe: {
      en: "Unsubscribe", pt: "Cancelar inscri\u00e7\u00e3o", es: "Cancelar suscripci\u00f3n",
      fr: "D\u00e9sabonner", de: "Abmelden", it: "Annulla iscrizione"
    },
    confirm: {
      en: "Confirm", pt: "Confirmar", es: "Confirmar",
      fr: "Confirmer", de: "Best\u00e4tigen", it: "Conferma"
    },
    enterAdminPassword: {
      en: "Please enter administrative password",
      pt: "Por favor, insira a senha administrativa",
      es: "Por favor, ingrese la contrase\u00f1a administrativa",
      fr: "Veuillez entrer le mot de passe administratif",
      de: "Bitte geben Sie das Administratorkennwort ein",
      it: "Inserisci la password amministrativa"
    },
    incorrectPassword: {
      en: "Incorrect password.",
      pt: "Senha incorreta.",
      es: "Contrase\u00f1a incorrecta.",
      fr: "Mot de passe incorrect.",
      de: "Falsches Passwort.",
      it: "Password errata."
    },

    /* ── Subscribe success ── */
    subscribed: {
      en: "Subscribed!", pt: "Inscrito!", es: "\u00a1Suscrito!",
      fr: "Abonn\u00e9\u00a0!", de: "Abonniert!", it: "Iscritto!"
    },

    /* ── Site title ── */
    siteTitle: {
      en: "The Augustine Journal",
      pt: "O Di\u00e1rio Agostiniano",
      es: "El Diario Agustiniano",
      fr: "Le Journal Augustinien",
      de: "Das Augustinische Journal",
      it: "Il Giornale Agostiniano"
    }
  };

  /* ===== Language detection ===== */

  /**
   * Detect best language using both navigator.languages (browser language
   * settings) and the server-detected language from the Accept-Language
   * header (passed via a <meta> tag).
   */
  function detectBestLang() {
    /* 1. Check navigator.languages (ordered by user preference) */
    var languages = navigator.languages
      ? Array.prototype.slice.call(navigator.languages)
      : [navigator.language || navigator.userLanguage || "en"];

    for (var i = 0; i < languages.length; i++) {
      var base = languages[i].toLowerCase().split("-")[0];
      if (SUPPORTED.indexOf(base) !== -1) return base;
    }

    /* 2. Fall back to server-detected language from Accept-Language header */
    var meta = document.querySelector('meta[name="detected-lang"]');
    if (meta) {
      var serverLang = (meta.getAttribute("content") || "").toLowerCase().split("-")[0];
      if (SUPPORTED.indexOf(serverLang) !== -1) return serverLang;
    }

    return "en";
  }

  /* ===== Translate static UI labels using built-in dictionaries ===== */
  function translateUiStrings(lang) {
    var nodes = document.querySelectorAll("[data-i18n]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute("data-i18n");
      var map = ui[key];
      if (!map) continue;
      el.textContent = map[lang] || map.en;
    }
  }

  /* ===== Translate placeholder attributes ===== */
  function translatePlaceholders(lang) {
    var nodes = document.querySelectorAll("[data-i18n-placeholder]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute("data-i18n-placeholder");
      var map = ui[key];
      if (!map) continue;
      el.setAttribute("placeholder", map[lang] || map.en);
    }
  }

  /* ===== Translate confirm prompts ===== */
  function translateConfirmPrompts(lang) {
    var nodes = document.querySelectorAll("[data-i18n-confirm]");
    for (var i = 0; i < nodes.length; i++) {
      var el = nodes[i];
      var key = el.getAttribute("data-i18n-confirm");
      var map = ui[key];
      if (!map) continue;
      var msg = map[lang] || map.en;
      el.setAttribute("onsubmit", "return confirm('" + msg.replace(/'/g, "\\'") + "');");
    }
  }

  /* ===== Google Translate cookie management ===== */
  function clearTranslateCookies() {
    var host = location.hostname;
    document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/;";
    document.cookie = "googtrans=; expires=Thu, 01 Jan 1970 00:00:00 UTC; path=/; domain=." + host;
  }

  function setTranslateCookies(lang) {
    clearTranslateCookies();

    if (lang && lang !== SITE_LANG) {
      var host = location.hostname;
      var val = "/en/" + lang;
      document.cookie = "googtrans=" + val + "; path=/";
      document.cookie = "googtrans=" + val + "; path=/; domain=." + host;
    }
  }

  /* ===== Clean URL hash (Google Translate may append #googtrans) ===== */
  function cleanUrlHash() {
    if (location.hash && location.hash.indexOf("googtrans") !== -1) {
      history.replaceState(null, "", location.pathname + location.search);
    }
  }

  /* ===== Programmatically trigger Google Translate ===== */
  function triggerGoogleTranslate(lang) {
    var attempts = 0;
    var maxAttempts = 80;
    var interval = setInterval(function () {
      attempts++;
      var combo = document.querySelector(".goog-te-combo");
      if (combo) {
        clearInterval(interval);
        combo.value = lang;
        combo.dispatchEvent(new Event("change"));
        /* Repeatedly hide the Google Translate banner */
        setTimeout(hideGoogleTranslateBanner, 300);
        setTimeout(hideGoogleTranslateBanner, 1000);
        setTimeout(hideGoogleTranslateBanner, 3000);
      }
      if (attempts >= maxAttempts) {
        clearInterval(interval);
      }
    }, 100);
  }

  function hideGoogleTranslateBanner() {
    /* Hide the top banner/frame that Google Translate injects */
    var frames = document.querySelectorAll(".goog-te-banner-frame");
    for (var i = 0; i < frames.length; i++) {
      frames[i].style.display = "none";
    }
    /* Ensure body stays at top (Google Translate pushes it down) */
    document.body.style.top = "0px";
  }

  /* ===== Initialize Google Translate Element ===== */
  function initGoogleTranslate(lang) {
    if (lang === SITE_LANG) return;

    setTranslateCookies(lang);

    /* Create the container div if it does not exist (admin pages) */
    if (!document.getElementById("google_translate_element")) {
      var gtDiv = document.createElement("div");
      gtDiv.id = "google_translate_element";
      document.body.insertBefore(gtDiv, document.body.firstChild);
    }

    window.googleTranslateElementInit = function () {
      new google.translate.TranslateElement(
        {
          pageLanguage: "en",
          autoDisplay: false,
          layout: google.translate.TranslateElement.InlineLayout.SIMPLE
        },
        "google_translate_element"
      );

      /* Programmatically trigger the target language */
      triggerGoogleTranslate(lang);
    };

    var script = document.createElement("script");
    script.src =
      "https://translate.google.com/translate_a/element.js?cb=googleTranslateElementInit";
    script.async = true;
    script.onerror = function () {
      console.warn("[i18n] Google Translate failed to load. Content will remain in English.");
    };
    document.head.appendChild(script);
  }

  /* ===== Translate dynamic content via the server API endpoint ===== */
  function translateDynamicContent(lang) {
    if (lang === SITE_LANG) return;

    var nodes = document.querySelectorAll("[data-translate='content']");
    if (!nodes.length) return;

    for (var i = 0; i < nodes.length; i++) {
      (function (node) {
        var original = node.getAttribute("data-original") || "";
        if (!original.trim()) return;

        fetch("/api/translate", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ text: original, targetLang: lang })
        })
          .then(function (resp) { return resp.json(); })
          .then(function (data) {
            if (data && data.used && typeof data.translatedText === "string") {
              node.textContent = data.translatedText;
            }
          })
          .catch(function () { /* Silently fail; Google Translate will handle it */ });
      })(nodes[i]);
    }
  }

  /* ===== Set HTML lang attribute ===== */
  function setHtmlLang(lang) {
    document.documentElement.setAttribute("lang", lang);
  }

  /* ===== Expose detected language for other scripts (e.g. share button) ===== */
  window.__i18nLang = "en";
  window.__i18nUi = ui;

  /* ===== Init on DOMContentLoaded ===== */
  document.addEventListener("DOMContentLoaded", function () {
    /* Always clear stale Google Translate cookies so language detection is
       fresh for each visitor — shared links won't carry someone else's
       language preference. */
    clearTranslateCookies();
    cleanUrlHash();

    var lang = detectBestLang();

    /* Expose detected language globally */
    window.__i18nLang = lang;

    /* Set HTML lang attribute */
    setHtmlLang(lang);

    /* Translate static UI strings from the built-in dictionary */
    translateUiStrings(lang);

    /* Translate placeholder attributes */
    translatePlaceholders(lang);

    /* Translate confirm prompt messages */
    translateConfirmPrompts(lang);

    /* Attempt server-side API translation for marked dynamic content */
    translateDynamicContent(lang);

    /* Auto-translate the full page via Google Translate for non-English */
    initGoogleTranslate(lang);
  });
})();
