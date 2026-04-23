export const fr = {
  // Nav
  "nav.home": "huozi.app",
  "nav.getStarted": "Commencer",
  "nav.signIn": "Connexion",
  "nav.workspace": "Workspace",
  "nav.signUp": "Inscription",
  "nav.docs": "Docs",
  "nav.cloud": "Cloud",
  "nav.edge": "Edge",
  "nav.blog": "Blog",

  // Home hero
  "home.title1": "Le verbe porte la voie",
  "home.title2.highlight": "Huozi",
  "home.title2.rest": ", le vecteur",
  "home.divider": "文",
  "home.subtitle1": "Un disque cloud pour agents.",
  "home.subtitle2": "Parle le dialecte d'outils-fichier de Claude Code. Montable depuis tout client MCP.",
  "home.cta.start": "Commencer",
  "home.cta.signIn": "Connexion",
  "home.cta.preview": "Aperçu",

  // Home features
  "home.feat1.icon": "云",
  "home.feat1.title": "Disque cloud pour agents",
  "home.feat1.desc": "Montez un workspace via MCP. Les outils Read / Edit / Write / Glob / Grep déjà connus de votre agent fonctionnent — rien à réapprendre.",
  "home.feat2.icon": "器",
  "home.feat2.title": "Bit-exact avec Claude Code",
  "home.feat2.desc": "Mêmes schémas, mêmes codes d'erreur, même cache de session. Claude Code, Cursor, Desktop ou HTTP brut — interchangeables.",
  "home.feat3.icon": "时",
  "home.feat3.title": "Sync live + historique",
  "home.feat3.desc": "Chaque commit est diffusé en ~100 ms à l'UI web. Chaque fichier a un journal complet. Écritures multi-agent atomiques.",

  // Home · deux éditions
  "home.products.label": "Deux éditions",
  "home.products.footnote": "Même surface MCP, même dialecte d'Agent. Choisissez où vivent les octets.",

  "home.cloud.tagline": "Hébergé sur huozi.app. Connexion e-mail, créez un workspace, branchez Claude Code en 60 secondes. Conçu pour les équipes et la collaboration multi-Agent.",
  "home.cloud.bullet1": "Connexion e-mail, multi-utilisateur, clé API par Agent",
  "home.cloud.bullet2": "Synchronisation WebSocket live vers l'UI web",
  "home.cloud.bullet3": "URL de partage publiques avec code à 6 chiffres optionnel",
  "home.cloud.cta": "Explorer Cloud",

  "home.edge.tagline": "Auto-hébergez le même disque sur votre propre compte Cloudflare ou Vercel. Un déployeur, un workspace, zéro Supabase. Licence MIT.",
  "home.edge.bullet1": "Aucune dépendance externe au-delà du runtime edge",
  "home.edge.bullet2": "Auth par collage de clé — pas d'e-mail, pas d'inscription",
  "home.edge.bullet3": "Déploiement en un clic, domaine personnalisé",
  "home.edge.cta": "Explorer Edge",

  // Home · fonctionnalités partagées
  "home.shared.label": "Partagé entre les deux",

  // Home CTA band
  "home.install.title": "Démarrer en 60 secondes",

  // Home code
  "home.code.title": "Monter, écrire un fichier",

  // /cloud hero
  "cloud.hero.tagline1": "Un disque dur natif pour les agents.",
  "cloud.hero.tagline2": "Parle le dialecte d'outils-fichier de Claude Code. Apportez votre propre agent. Les agents écrivent, les humains lisent.",
  "cloud.cta.signIn": "Connexion",
  "cloud.cta.open": "Ouvrir mon workspace",
  "cloud.cta.connectAgent": "Connecter un agent",

  // /workspace — onboarding d'état vide
  "ws.status.title": "Votre workspace",
  "ws.status.connectedAgents": "Agents connectés",
  "ws.status.browserSession": "Session navigateur",
  "ws.status.never": "—",
  "ws.status.now": "à l'instant",
  "ws.status.activeKeys": "clés actives",
  "ws.status.lastActivity": "dernière activité",
  "ws.status.manage": "Gérer",
  "ws.status.connectNew": "Nouvelle connexion",

  // Étiquettes d'expiration de clé (TTL à fenêtre glissante)
  "ws.expiry.never": "n'expire jamais",
  "ws.expiry.expired": "expirée",
  "ws.expiry.inDays": "expire dans {n} jours",
  "ws.expiry.inHours": "expire dans {n} heures",
  "ws.expiry.inMinutes": "expire dans {n} min",
  "ws.expiry.hint": "Fenêtre glissante — chaque requête réinitialise le compteur.",

  // Préréglages TTL
  "ws.ttl.1d": "1 jour",
  "ws.ttl.7d": "7 jours",
  "ws.ttl.30d": "30 jours",
  "ws.ttl.180d": "180 jours",
  "ws.ttl.never": "Jamais",

  // Actions par clé
  "ws.action.copy": "Copier",
  "ws.action.copied": "Copié",
  "ws.action.revoke": "Révoquer",
  "ws.action.revoking": "Révocation…",
  "ws.action.confirmRevoke": "Révoquer « {label} » ? Les Agents utilisant cette clé s'arrêteront immédiatement. Cette action est irréversible.",

  // /workspace — état rempli, intro + cartes d'aide + pied de page
  "ws.filled.intro": "Sélectionnez un fichier dans l'arbre à gauche pour le voir. Markdown et HTML s'affichent de la même façon que sur les pages publiées huozi.app. Les Agents ayant accès à ce workspace peuvent modifier les fichiers à tout moment — ouvrez un fichier et regardez l'onglet historique.",
  "ws.filled.browse.title": "Parcourir",
  "ws.filled.browse.desc": "Utilisez l'arbre (☰ sur mobile). Les dossiers se souviennent de leur état ouvert.",
  "ws.filled.history.title": "Historique",
  "ws.filled.history.desc": "Chaque fichier a un lien Historique listant tous les commits qui l'ont modifié.",
  "ws.filled.search.title": "Rechercher",
  "ws.filled.search.desc": "Filtrez par nom dans la barre au-dessus de l'arbre.",
  "ws.filled.footer.about": "À propos de huozi Cloud",
  "ws.filled.footer.apiDocs": "Référence API",


  "ws.onboard.heading": "Créons quelque chose",
  "ws.onboard.subheading": "Copiez un scénario ci-dessous, collez-le dans votre agent, et regardez le premier fichier apparaître ici en temps réel. Choisissez le format qui vous convient — l'agent s'occupe du reste.",

  "ws.onboard.md.badge": ".md",
  "ws.onboard.md.title": "Bilan hebdomadaire",
  "ws.onboard.md.scenario": "Note libre — idéal pour écrire, réfléchir, tenir un journal. Affiché en Markdown.",
  "ws.onboard.md.prompt": "Écris-moi un bilan de cette semaine : trois choses livrées, deux choses bloquées, une idée à poursuivre la semaine prochaine. Dans reviews/2026-w17.md, avec titres Markdown et listes courtes.",

  "ws.onboard.csv.badge": ".csv",
  "ws.onboard.csv.title": "Un tableau de données",
  "ws.onboard.csv.scenario": "Données tabulaires structurées. Affiché comme un tableau triable, facile à étendre ligne par ligne.",
  "ws.onboard.csv.prompt": "Construis un CSV dans data/ai-milestones-2025.csv répertoriant 12 moments marquants d'entreprises IA de l'année écoulée. Colonnes : date, company, event, impact_note. Trier chronologiquement.",

  "ws.onboard.html.badge": ".html",
  "ws.onboard.html.title": "Une page visuelle",
  "ws.onboard.html.scenario": "Rendu riche — illustrations, graphiques, pages de couverture. Rendu HTML avec assainissement.",
  "ws.onboard.html.prompt": "Crée une belle page HTML de couverture dans cover/movable-type.html sur l'imprimerie à caractères mobiles, avec un dégradé beige chaud, typographie serif, et un court paragraphe expliquant son importance. Ajoute une timeline Echarts simple des inventions clés.",

  "ws.onboard.copy": "Copier le prompt",
  "ws.onboard.copied": "Copié",

  // Home open source
  "home.oss.title": "Open Source",
  "home.oss.desc": "Auto-hébergez votre propre moteur de publication Markdown & HTML. Zéro base de données, juste KV. Licence MIT.",
  "home.oss.deployCF": "Déployer sur Cloudflare",
  "home.oss.deployVercel": "Déployer sur Vercel",
  "home.oss.soon": "bientôt",

  // Home footer
  "home.footer": "Huozi — Typographie mobile pour l'ère de l'IA",

  // Auth
  "auth.login.title": "Connexion à Huozi",
  "auth.login.subtitle": "Entrez votre e-mail. Pas de mot de passe.",
  "auth.login.checkEmail": "Vérifiez votre e-mail pour le code.",
  "auth.login.email": "E-mail",
  "auth.login.code": "Code de vérification",
  "auth.login.sendCode": "Envoyer le code",
  "auth.login.sending": "Envoi...",
  "auth.login.verify": "Vérifier",
  "auth.login.verifying": "Vérification...",
  "auth.login.changeEmail": "Utiliser un autre e-mail",
  "auth.login.newHere": "Nouveau ici ?",
  "auth.login.guide": "Guide de démarrage",

  // Dashboard

  // Dashboard new page

  // Settings
  "settings.title": "Paramètres",
  "settings.subtitle": "Gérez votre espace de travail et vos clés API.",
  "settings.workspace": "Espace de travail",
  "settings.workspaceDesc": "Préfixe URL de votre espace de travail.",
  "settings.apiKeys": "Clés API",
  "settings.apiKeysDesc": "Utilisez les clés API pour publier depuis des agents IA ou des scripts.",
  "settings.apiUsage": "Utilisation de l'API",
  "settings.apiUsageDesc": "Exemple rapide pour publier une page :",
  "settings.getStarted": "Commencer",
  "settings.getStartedDesc": "Apprenez à configurer Claude Code MCP, OpenClaw ou l'API conversationnelle.",
  "settings.viewGuide": "Voir le guide de démarrage",

  // Workspace setup
  "workspace.setup.title": "Configurer l'espace de travail",
  "workspace.setup.desc": "Choisissez un slug unique pour votre espace de travail. Il fera partie des URL de vos pages.",
  "workspace.setup.label": "Slug de l'espace",
  "workspace.setup.placeholder": "votre-nom",
  "workspace.setup.submit": "Créer l'espace",
  "workspace.setup.loading": "Création...",

  // API Key manager
  "apiKey.created": "Clé API créée ! Copiez-la maintenant — elle ne sera plus affichée.",
  "apiKey.copy": "Copier",
  "apiKey.dismiss": "Fermer",
  "apiKey.nameLabel": "Nom de la clé",
  "apiKey.namePlaceholder": "ex. Claude Agent",
  "apiKey.create": "Créer la clé",
  "apiKey.creating": "Création...",
  "apiKey.confirmRevoke": "Révoquer cette clé API ? Cette action est irréversible.",
  "apiKey.neverUsed": "Jamais utilisée",
  "apiKey.lastUsed": "Dernière utilisation",
  "apiKey.revoke": "Révoquer",
  "apiKey.empty": "Pas de clé API. Créez-en une pour publier via l'API.",

  // Conversational install
  "install.copyButton": "Copier pour installer",
  "install.copied": "Copié !",

  // /start — guide d'installation
  "start.meta.title": "Commencer — huozi Cloud",
  "start.meta.description":
    "Une commande ou une invite. Donnez-la à n'importe quel Agent. Un clic de lien. Terminé.",
  "start.hero.title": "Commencer",
  "start.hero.subtitle":
    "Une invite, un clic, terminé. Fonctionne avec n'importe quel Agent compatible MCP.",

  "start.fastest.title": "Le plus rapide · une commande",
  "start.fastest.badge": "Node ≥ 18",
  "start.fastest.desc1":
    "Exécute le même flux OAuth device que ci-dessous. Détecte automatiquement votre client (Claude Code / Cursor / OpenClaw), ouvre un navigateur pour l'autorisation, puis écrit la configuration MCP au bon endroit.",
  "start.fastest.desc2Before": "Dites à votre Agent :",
  "start.fastest.tellAgent": "exécute npx huozi-mcp et aide-moi à autoriser",
  "start.fastest.desc2After": "— l'Agent fait le reste.",

  "start.prompt.title": "1 · Ou, collez cette invite dans votre Agent",
  "start.prompt.badge": "Lisible par l'Agent",
  "start.prompt.desc":
    "Fonctionne dans Claude Code, Cursor, OpenClaw, ou tout Agent capable d'appels HTTP. L'Agent lit les étapes et les exécute ; votre seul rôle est de cliquer une fois sur Authorize dans le navigateur.",
  "start.prompt.langNote":
    "(Conservé en anglais — tous les LLM le lisent nativement.)",

  "start.authorize.title": "2 · L'Agent imprime un lien — cliquez sur Authorize",
  "start.authorize.example":
    "→ Ouvrez https://huozi.app/device?code=ABCD-1234 et cliquez sur Authorize.",
  "start.authorize.desc":
    "Ouvrez le lien dans n'importe quel navigateur. Si vous n'êtes pas connecté à huozi.app, faites d'abord un email OTP unique. Vous verrez ensuite quel Agent demande l'accès, à quel workspace, et un bouton Authorize. Cliquez, puis fermez l'onglet.",

  "start.done.title": "3 · L'Agent se connecte automatiquement · terminé",
  "start.done.descBefore":
    "En quelques secondes, l'Agent récupère la clé, enregistre le serveur MCP, et annonce",
  "start.done.connectedPhrase": "✓ Connecté au workspace …",
  "start.done.descAfter":
    ". Désormais chaque requête de l'Agent peut lire et écrire dans votre workspace huozi.",
  "start.done.manageBefore":
    "Gérez les connexions, parcourez les fichiers, révoquez à tout moment depuis",
  "start.done.manageAfter": ".",

  "start.manual.summary": "Pas d'Agent ? À la main",
  "start.manual.desc":
    "Le même flux est du HTTP brut — vous pouvez exécuter les commandes curl vous-même :",
  "start.manual.noteBefore":
    "Déjà connecté à huozi.app ? Vous pouvez aussi obtenir un extrait de configuration prêt à coller pour Cursor / OpenClaw directement à :",
  "start.manual.noteAfter": ".",

  "start.footer.mcp.title": "Référence MCP",
  "start.footer.mcp.desc":
    "Tous les outils huozi_*, le format JSON-RPC, les événements temps réel.",
  "start.footer.cloud.title": "À propos de Cloud",
  "start.footer.cloud.desc":
    "Pourquoi les Agents ont besoin d'un drive partagé avec historique de commits.",
  "start.footer.edge.title": "Auto-hébergé (Edge)",
  "start.footer.edge.desc":
    "Le même drive, déployé sur votre propre Cloudflare / Vercel. MIT.",

  // InstallPicker sur /start
  "start.picker.title": "Installation selon votre agent",
  "start.picker.subtitle":
    "Choisissez votre client — nous afficherons exactement ce qui s'applique. MCP apporte les outils ; Skill / Rules apporte le savoir-faire. La plupart des clients veulent les deux.",
  "start.picker.generic.name": "Générique / Autre",

  "start.picker.content.claude-code.mcp.body":
    "Le plus simple : exécutez ceci dans n'importe quel terminal. Le CLI ouvre votre navigateur pour une autorisation en un clic, écrit la configuration MCP utilisateur de Claude Code, et tout nouveau shell la prend en compte.",
  "start.picker.content.claude-code.skill.body":
    "Déposez le SKILL.md canonique dans le dossier skills de Claude Code. L'Agent le charge à la demande et apprend quand utiliser chaque outil huozi_*.",
  "start.picker.content.claude-code.skill.note":
    "Skill ajoute le *savoir-faire*, pas les outils eux-mêmes. Si vous n'avez pas encore configuré MCP, faites-le d'abord (onglet MCP ci-dessus).",

  "start.picker.content.cursor.mcp.body":
    "Le plus simple : ouvrez le terminal intégré de Cursor (⌘J) et exécutez ceci. Il écrit ~/.cursor/mcp.json ; Reload Window (⌘⇧P) pour prendre en compte.",
  "start.picker.content.cursor.rules.body":
    "L'équivalent Cursor d'un Skill est une Rule — un fichier Markdown dans .cursor/rules/ que l'Agent charge en contexte. Même fichier source que les autres clients.",
  "start.picker.content.cursor.rules.note":
    "Cela s'installe au niveau du projet. Pour des règles utilisateur, déposez le même fichier dans ~/.cursor/rules/. L'accès aux outils passe toujours par MCP.",

  "start.picker.content.openclaw.mcp.body":
    "Le plus simple : exécutez ceci. Le CLI écrit ~/.openclaw/openclaw.json sous mcp.servers.huozi (transport : streamable-http) ; redémarrez OpenClaw pour l'activer.",
  "start.picker.content.openclaw.skill.body":
    "OpenClaw dispose d'un système de skill natif. Pour l'instant, placez le fichier manuellement ; une fois publié sur ClawHub, vous lancerez `openclaw skills install huozi/mcp`.",
  "start.picker.content.openclaw.skill.note":
    "Publication ClawHub en attente. Même principe que les autres flux skill : le skill apporte le guide ; les appels d'outils passent toujours par MCP.",

  "start.picker.content.generic.mcp.body":
    "Tout Agent capable d'appels HTTP. Collez cette invite dans l'Agent — il lit les étapes, exécute le flux device en curl, et écrit sa propre configuration MCP. Votre seul rôle : cliquer une fois sur Authorize dans le navigateur.",
  "start.picker.content.generic.mcp.note":
    "Conservé en anglais — les LLM lisent l'anglais nativement et traduire les étapes risque des dérives subtiles. Fonctionne pour tout client MCP stdio / HTTP.",

  // Page Connect-Agent
  "connect.back": "← Espace de travail",
  "connect.title": "Connecter un Agent",
  "connect.desc":
    "Trois étapes : choisissez votre agent, collez un extrait, envoyez une requête. Nous détectons le premier appel et confirmons la connexion. Chaque agent a sa propre clé — révocable à tout moment sans affecter les autres.",

  "connect.step1": "1 · Choisissez votre agent",
  "connect.step2": "2 · Collez dans {title}",
  "connect.step3": "3 · Confirmer la connexion",

  "connect.agent.claude-code.tagline": "Terminal, une commande.",
  "connect.agent.claude-code.blurb":
    "Exécutez dans n'importe quel shell. Claude Code enregistre huozi comme serveur MCP distant — disponible dans tous les projets.",
  "connect.agent.cursor.tagline": "À ajouter dans mcp.json.",
  "connect.agent.cursor.blurb":
    "Ajoutez ce bloc à ~/.cursor/mcp.json (ou au .cursor/mcp.json du projet), puis rechargez Cursor.",
  "connect.agent.openclaw.tagline": "Modifier openclaw.json.",
  "connect.agent.openclaw.blurb":
    "Ajoutez ce bloc à ~/.openclaw/openclaw.json sous mcp.servers. Redémarrez OpenClaw pour l'activer.",

  "connect.label.title": "Étiquetez cette clé (affichée dans Connected Agents)",
  "connect.generate": "Générer une clé pour {title}",
  "connect.generating": "Génération…",
  "connect.copy": "Copier",
  "connect.copied": "Copié",
  "connect.generateFirst": "Générez d'abord une clé",

  "connect.rawKey.show": "Afficher la clé API brute",
  "connect.rawKey.note":
    "Le texte en clair n'est jamais stocké — copiez-la maintenant. Les clés perdues peuvent être révoquées et remplacées depuis la page workspace.",

  "connect.waiting.title": "En attente de la connexion de {title}…",
  "connect.waiting.desc":
    "Collez l'extrait ci-dessus, puis envoyez une requête — nous détecterons automatiquement le premier appel.",

  "connect.done.title": "{title} connecté",
  "connect.done.detected": "Premier appel d'outil détecté à",
  "connect.done.note":
    "Vous pouvez fermer cette page — l'agent continuera à utiliser la clé jusqu'à révocation.",
  "connect.done.goto": "Aller à l'espace de travail →",
  "connect.done.another": "Connecter un autre agent",

  "connect.footer.back": "← Retour à l'espace de travail",
  "connect.footer.start": "Laisser l'agent s'installer lui-même (OAuth device flow) →",
  "connect.footer.docs": "Documentation API",

  "connect.terminal.title": "Vous préférez le terminal ? Une commande :",
  "connect.terminal.desc":
    "Fonctionne dans Claude Code, Cursor, OpenClaw — ou n'importe quel agent avec un shell. Exécute le même flux OAuth et écrit la configuration MCP pour vous.",
} as const;
