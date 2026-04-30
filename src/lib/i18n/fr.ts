export const fr = {
  // Nav

  // Home hero

  // Home features

  // Home · deux éditions



  // Home · fonctionnalités partagées

  // Home · trois angles (印 / 版 / 盘). Les onglets changent les cartes
  // et le bloc de code sur place — pas de navigation.

  // 印 · MCP — le caractère comme interface

  // 版 · STYLE — des octets qui se rendent avec grâce

  // 盘 · CLOUD — des octets dans le cloud, partagés entre Agents


  // Home CTA band

  // Home code

  // /cloud hero

  // /cloud — page complète











  // /edge — page complète






  // Pied de page marketing — groupes

  // Workspace · panneau Récent
  "recent.title": "Récent",
  "recent.op.new": "nouveau",
  "recent.op.edited": "modifié",
  "recent.op.deleted": "supprimé",
  "recent.folderCreated": "dossier créé",

  // Workspace · erreur / indice de la vue de fichier
  "view.error.label": "Erreur",
  "view.error.aclDenied.title": "Ce dossier est privé",
  "view.error.aclDenied.body": "Vous n'avez pas accès à ce chemin. Demandez à un membre de vous inviter, ou choisissez un autre fichier dans la barre latérale.",
  "view.readOnly.title": "Modifier ce fichier ?",
  "view.readOnly.body": "Demandez à votre Agent connecté (Claude Code, Cursor, Claude Desktop, ou tout client MCP). L'UI Web de huozi Cloud est en lecture seule par conception — toutes les écritures passent par un chemin de commit audité via MCP.",

  // Workspace · titre latéral (lien cliquable vers l'accueil)
  "ws.shell.title": "Workspace",
  "ws.shell.subtitle": "Gérer · Rechercher",
  "ws.stats.files": "Fichiers",
  "ws.stats.recent": "Modifs récentes",
  "ws.stats.agents": "Agents",
  "ws.search.title": "Rechercher dans le workspace",
  "ws.search.placeholder": "Tapez un nom de fichier ou chemin…",
  "ws.search.noMatch": "Aucun fichier ne correspond.",

  // Dialogue de partage — expiration
  "share.expiry.label": "Le lien expire dans",
  "share.expiry.hint": "Les liens expirés renvoient introuvable. Choisissez « Jamais » pour un lien permanent.",
  "share.expiry.30m": "30 min",
  "share.expiry.6h": "6 heures",
  "share.expiry.24h": "24 heures",
  "share.expiry.1mo": "1 mois",
  "share.expiry.never": "Jamais",
  "share.expiry.expiresAt": "Expire {when}",
  "share.expiry.permanent": "Sans expiration",

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

  // Home footer

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

  // Sélection d'espace de travail
  "auth.selectWorkspace.title": "Choisir un espace de travail",
  "auth.selectWorkspace.subtitle":
    "Vous appartenez à {count} espaces de travail. Choisissez-en un.",

  // Page d'invitation
  "invite.notFound.title": "Invitation introuvable",
  "invite.notFound.message":
    "Ce lien d'invitation est invalide ou a été supprimé.",
  "invite.accepted.title": "Déjà acceptée",
  "invite.accepted.message":
    "Cette invitation a déjà été acceptée. Connectez-vous si ce n'est pas déjà fait.",
  "invite.revoked.title": "Invitation révoquée",
  "invite.revoked.message":
    "Le propriétaire de l'espace de travail a révoqué cette invitation. Demandez-lui d'en envoyer une nouvelle.",
  "invite.expired.title": "Invitation expirée",
  "invite.expired.message":
    "Cette invitation a plus de 7 jours. Demandez au propriétaire d'en envoyer une nouvelle.",
  "invite.welcome.title": "Vous êtes invité·e",
  "invite.welcome.invitedYouTo": "{inviter} vous a invité·e à rejoindre",
  "invite.welcome.signInAs": "Se connecter en tant que {email}",
  "invite.welcome.codeNotice":
    "Nous enverrons un code à 6 chiffres à {email}.",
  "invite.wrongAccount.title": "Mauvais compte",
  "invite.wrongAccount.message":
    "Vous êtes connecté·e en tant que {current}, mais cette invitation est pour {target}. Déconnectez-vous et rouvrez ce lien.",
  "invite.wrongAccount.signOut": "Se déconnecter",
  "invite.error.title": "Impossible d'accepter l'invitation",

  // Toast d'arrivée
  "joined.toast": "Rejoint {slug}",

  // Changement d'espace
  "switcher.heading": "Changer d'espace",

  // Menu utilisateur (en-tête)
  "menu.nav.files": "Fichiers",
  "menu.nav.shares": "Partages",
  "menu.nav.members": "Membres",
  "menu.nav.folders": "Accès aux dossiers",
  "menu.identity.signedIn": "Connecté·e",
  "menu.identity.workspace": "Espace",
  "menu.language": "Langue",
  "menu.theme": "Thème",
  "theme.default.name": "Papier",
  "theme.brutalMono.name": "Bloc",
  "theme.applying": "Application",
  "menu.home": "Retour à huozi.app",
  "menu.exit": "Quitter",
  "menu.disconnect": "Déconnecter",

  // Gestion des membres
  "members.title": "Membres",
  "members.subtitle.owner":
    "Invitez des collaborateurs, voyez qui a accès, et retirez les personnes que vous ne souhaitez plus dans cet espace.",
  "members.subtitle.member": "Personnes ayant accès à cet espace de travail.",
  "members.invite.heading": "Inviter un·e collaborateur·trice",
  "members.invite.placeholder": "eux@exemple.com",
  "members.invite.submit": "Inviter",
  "members.invite.submitting": "Envoi…",
  "members.invite.note":
    "Ils recevront un e-mail avec un lien valide 7 jours. En l'acceptant, ils deviennent membres de cet espace.",
  "members.list.heading": "Membres ({count})",
  "members.list.you": "(vous)",
  "members.list.remove": "retirer",
  "members.list.removeConfirm": "Retirer ce membre ?",
  "members.role.owner": "owner",
  "members.role.member": "member",
  "members.invites.heading": "Invitations en attente ({count})",
  "members.invites.expires": "expire le {date}",
  "members.invites.revoke": "révoquer",
  "members.invites.revokeConfirm": "Révoquer cette invitation ?",
  // Clés par membre
  "members.keys.summary": "{count} clés",
  "members.keys.revoke": "révoquer",
  "members.keys.revokeConfirm": "Révoquer cette clé ? Action irréversible.",
  "members.keys.lastUsed": "dernière utilisation {rel}",
  "members.keys.neverUsed": "jamais utilisée",
  "members.error.invite_failed": "Impossible d'envoyer l'invitation.",
  "members.error.already_member": "Cet e-mail est déjà membre.",
  "members.error.remove_failed": "Impossible de retirer.",
  "members.error.owner_only":
    "Seul le propriétaire de l'espace peut faire cela.",

  // ACL des dossiers
  "folders.title": "Accès aux dossiers",
  "folders.subtitle":
    "Verrouillez un dossier pour limiter la lecture/écriture à des membres spécifiques. Le propriétaire de l'espace n'a pas de bypass.",
  "folders.create.heading": "Rendre un dossier privé",
  "folders.create.placeholder": "funds/fund-A/",
  "folders.create.note":
    "Le chemin doit se terminer par /. Les sous-dossiers héritent. Seuls les membres cochés pourront lire ou écrire.",
  "folders.create.submit": "Verrouiller",
  "folders.create.submitting": "Verrouillage…",
  "folders.members.heading": "Membres avec accès",
  "folders.members.you": "(vous)",
  "folders.list.heading": "Dossiers privés ({count})",
  "folders.list.empty": "Aucun dossier privé pour l'instant.",
  "folders.list.memberCount": "{count} membres",
  "folders.list.edit": "modifier",
  "folders.list.save": "Enregistrer",
  "folders.list.cancel": "Annuler",
  "folders.list.makePublic": "rendre public",
  "folders.makePublicConfirm":
    "Déverrouiller ce dossier ? Tout l'espace pourra y lire et écrire à nouveau.",
  "folders.error.create_failed": "Échec de la création de l'ACL.",
  "folders.error.update_failed": "Échec de la mise à jour de l'ACL.",
  "folders.error.empty_members": "Sélectionnez au moins un membre.",
  "folders.error.self_excluded":
    "Vous devez rester dans l'ACL — sinon le dossier sera inaccessible.",
  "folders.error.member_not_in_workspace":
    "Le membre sélectionné n'est plus dans cet espace.",
  "folders.error.not_in_acl":
    "Ce dossier est privé — vous devez déjà en être membre pour modifier l'ACL.",
  "folders.error.invalid_path_prefix":
    "Le chemin doit être relatif et sans segment '..'.",
  "folders.error.empty_path_prefix": "Le chemin est requis.",
  // Spécifique modal
  "folders.modal.heading": "Accès au dossier",
  "folders.modal.publicTitle": "Public",
  "folders.modal.publicHint": "Tout membre",
  "folders.modal.privateTitle": "Privé",
  "folders.modal.privateHint": "Membres choisis uniquement",
  "folders.error.load_failed": "Impossible de charger l'accès.",

  // Dashboard

  // Dashboard new page

  // Settings

  // Workspace setup

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

  // /start — guide d'installation








  // InstallPicker sur /start





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

  // CSV · détails de la ligne
  "csv.rowDetail.title": "Détails de la ligne",
  "csv.rowDetail.open": "Ouvrir les détails de la ligne",
  "csv.rowDetail.close": "Fermer",
  "csv.rowDetail.rowOf": "Ligne {n} sur {total}",
  "csv.rowDetail.empty": "—",
} as const;
