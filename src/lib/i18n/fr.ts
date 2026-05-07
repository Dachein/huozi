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
  "recent.filter.view.label": "Filtre",
  "recent.filter.view.works": "Œuvres",
  "recent.filter.view.assets": "Ressources",

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
  "ws.search.placeholder": "Rechercher noms ou contenus de fichiers…",
  "ws.search.noMatch": "Aucun fichier ne correspond.",
  "ws.search.fileMatches": "Noms correspondants",
  "ws.search.contentMatches": "Contenus correspondants",
  "ws.search.searching": "Recherche dans les contenus…",
  "ws.search.noContentMatch": "Aucune correspondance dans les contenus.",
  "ws.search.truncated": "Résultats tronqués — essayez un terme plus précis.",
  "ws.search.error": "Échec de la recherche, veuillez réessayer.",

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
  "ws.status.collapse": "Réduire",

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


  // Les quatre catégories de type — voir app/docs/four-types.md
  "ws.types.all": "Tous",
  "ws.types.table": "Tableau",
  "ws.types.document": "Document",
  "ws.types.collection": "Collection",
  "ws.types.page": "Page",
  "ws.types.other": "Autre",

  // Rendu Collection (.jsonl)
  "ws.coll.view.current": "Actuel",
  "ws.coll.view.stream": "Flux",
  "ws.coll.view.table": "Tableau",
  "ws.coll.view.timeline": "Chronologie",
  "ws.coll.entities": "{n} entités",
  "ws.coll.events": "{n} événements",
  "ws.coll.errors": "{n} erreurs",
  "ws.coll.empty.title": "Ceci est une Collection",
  "ws.coll.empty.body": "Les Collections sont l'un des quatre types de données huozi — un flux d'entités avec identité et temps. Demandez à votre agent d'ajouter le premier événement.",
  "ws.coll.empty.prompt": "Ajoute le premier événement à ce fichier jsonl. Chaque ligne est un objet JSON avec au moins un champ `id` (identité); recommandé : `at` (horodatage), `by` (acteur), `op` (verbe). Append-only — ne modifie pas les lignes existantes.",
  "ws.coll.deleted": "supprimé",
  "ws.coll.pickEntity": "Choisissez une entité pour voir sa chronologie",
  "ws.coll.backToList": "← Retour",
  "ws.coll.fields": "Champs",
  "ws.coll.search": "Rechercher",

  "ws.onboard.heading": "Construisons votre CRM",
  "ws.onboard.subheading": "Copiez un scénario, collez-le dans votre agent. Ces quatre cartes sont les quatre types de données qui travaillent ensemble — Tableau, Document, Collection, Page — chacune produit un fichier réel dans un mini espace de gestion clients.",

  "ws.onboard.md.badge": ".md",
  "ws.onboard.md.title": "Un manuel de vente",
  "ws.onboard.md.scenario": "Document — prose continue. SOP, savoir, notes. Rendu Markdown.",
  "ws.onboard.md.prompt": "Écris un manuel de suivi client dans crm/playbook.md couvrant 4 étapes — premier contact, découverte des besoins, négociation, suivi après signature — avec 3 scripts concrets par étape. Titres Markdown et listes courtes.",

  "ws.onboard.csv.badge": ".csv",
  "ws.onboard.csv.title": "Une liste de clients",
  "ws.onboard.csv.scenario": "Tableau — grille homogène. Master, listes, instantané. Tableau triable.",
  "ws.onboard.csv.prompt": "Construis un CSV dans crm/customers.csv listant 8 clients PME dans 3 secteurs différents. Colonnes : name, industry, size, region, contact_name, phone, since.",

  "ws.onboard.jsonl.badge": ".jsonl",
  "ws.onboard.jsonl.title": "Un journal d'interactions",
  "ws.onboard.jsonl.scenario": "Collection — flux d'entités, chacune avec identité et temps. Append-only, historique gratuit.",
  "ws.onboard.jsonl.prompt": "Crée un journal d'interactions dans crm/interactions.jsonl — JSON ligne par ligne, append-only. Ajoute 4 événements pour le client cust_acme : un appel, une proposition envoyée, un retour client, une affaire gagnée. Chaque ligne doit porter : id (id événement), at (horodatage), by (acteur), op (verbe : call / proposal_sent / feedback / closed_won), customer_id, plus les champs spécifiques (notes, montant, etc.).",

  "ws.onboard.html.badge": ".html",
  "ws.onboard.html.title": "Une page de proposition",
  "ws.onboard.html.scenario": "Page — artefact visuel fini. HTML assaini, 5 sous-formats.",
  "ws.onboard.html.prompt": "Crée une page de proposition de service annuel dans crm/proposals/acme-2026-q2.html pour le client Acme. Fond beige chaud, typographie serif, 3 pages : couverture (thème), arguments de valeur (3 points), tarifs (52 000 € annuels, 4 services inclus).",

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

  // /authorize — page de consentement OAuth
  "auth.authorize.error.title": "Autorisation impossible",
  "auth.authorize.error.missingSession.title": "Session manquante",
  "auth.authorize.error.missingSession.body":
    "Cette URL n'a pas de paramètre session. Relancez la connexion depuis votre Agent.",
  "auth.authorize.error.expired":
    "Cette demande d'autorisation a expiré (limite de 15 min). Relancez-la depuis votre Agent.",
  "auth.authorize.error.alreadyConsumed":
    "Cette demande d'autorisation a déjà été utilisée.",
  "auth.authorize.error.notFound": "Demande d'autorisation introuvable.",
  "auth.authorize.connectTitle": "Connecter {client}",
  "auth.authorize.workspaceLabel": "Espace de travail concerné",
  "auth.authorize.permissionsLabel": "Permissions",
  "auth.authorize.tokenReturnsToLabel": "Le jeton sera renvoyé vers",
  "auth.authorize.deny": "Refuser",
  "auth.authorize.approve": "Autoriser",
  "auth.authorize.processing": "Traitement…",
  "auth.authorize.tokenSecurity":
    "Une fois autorisé, {client} recevra un access token court (1 heure) + un refresh token révocable.",
  "auth.authorize.tokenContext":
    "Le jeton reste chez le client MCP ; il n'entre jamais dans le contexte de conversation.",
  "auth.authorize.scope.mcp":
    "Lire · Écrire · Partager les fichiers de cet espace",
  "auth.authorize.scope.read": "Lire les fichiers de cet espace",
  "auth.authorize.scope.write": "Écrire dans les fichiers de cet espace",
  "auth.authorize.scope.share": "Créer des liens de partage publics",

  // /authorize/done — page de confirmation après autorisation
  "auth.authorize.done.heading": "Connecté à {client}",
  "auth.authorize.done.workspaceLabel": "Espace de travail",
  "auth.authorize.done.countingLoopback":
    "Envoi du jeton à {client} dans {seconds} s…",
  "auth.authorize.done.countingRemote":
    "Retour vers {client} dans {seconds} s…",
  "auth.authorize.done.buttonRemote": "Revenir maintenant",
  "auth.authorize.done.buttonLoopback": "Envoyer maintenant",
  "auth.authorize.done.triggeringRemote": "Retour vers {client}…",
  "auth.authorize.done.triggeringLoopback": "Envoi du jeton à {client}…",
  "auth.authorize.done.doneRemote":
    "Autorisation envoyée. Retour vers {client}…",
  "auth.authorize.done.doneLoopback":
    "Jeton envoyé. Vous pouvez revenir au terminal {client}.",
  "auth.authorize.done.openWorkspace": "Ou ouvrir l'espace de travail",
  "auth.authorize.done.viewWorkspace": "Voir l'espace de travail",
  "auth.authorize.done.tokenSecurity":
    "Le jeton est détenu par {client} ; il n'entre jamais dans le contexte de conversation.",
  "auth.authorize.done.tokenContext":
    "Révocable à tout moment depuis « Agents connectés » dans votre espace de travail.",

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
  "theme.confirm.title": "Changer de style",
  "theme.confirm.body": "Passer à « {name} » ? La page sera rechargée.",
  "theme.confirm.experimental": "Style expérimental inspiré de la direction créative de Slock.",
  "theme.confirm.action": "Confirmer",
  "theme.confirm.cancel": "Annuler",
  "locale.confirm.title": "Changer de langue",
  "locale.confirm.body": "Passer à « {name} » ?",

  "confirm.revokeKey.title": "Révoquer la clé",
  "confirm.revokeKey.body": "Révoquer « {label} » ? Tout agent utilisant cette clé cessera de fonctionner immédiatement.",
  "confirm.revokeKey.warning": "Cette action est irréversible.",
  "confirm.revokeKey.action": "Révoquer",
  "confirm.revokeShare.title": "Révoquer le lien",
  "confirm.revokeShare.body": "Révoquer le partage de « {path} » ? L'URL cessera immédiatement et les visiteurs ayant enregistré le lien obtiendront 404.",
  "confirm.revokeShare.action": "Révoquer",
  "confirm.removeMember.title": "Retirer le membre",
  "confirm.removeMember.body": "Retirer ce membre ? Il perdra immédiatement l'accès à cet espace.",
  "confirm.removeMember.action": "Retirer",
  "confirm.cancelInvite.title": "Annuler l'invitation",
  "confirm.cancelInvite.body": "Annuler cette invitation ?",
  "confirm.cancelInvite.action": "Annuler",
  "confirm.makePublic.title": "Rendre public",
  "confirm.makePublic.body": "Déverrouiller ce dossier ? Tous les membres pourront le lire et écrire.",
  "confirm.makePublic.action": "Rendre public",
  "confirm.cancel": "Annuler",
  "menu.home": "Site huozi.app",
  "menu.exit": "Quitter",
  "menu.disconnect": "Déconnecter",

  // Gestion des membres
  "members.col.email": "E-mail",
  "members.col.role": "Rôle",
  "members.col.keys": "Clés",
  "members.col.expires": "Expire",
  "members.col.actions": "",

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
  "members.list.empty": "Aucun membre pour le moment. Les collaborateur·trice·s invité·e·s apparaîtront ici.",
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
  "connect.agent.codex.tagline": "Une commande au terminal.",
  "connect.agent.codex.blurb":
    "OpenAI Codex CLI s'enregistre via codex mcp add — le bearer est lu indirectement via env-var, donc le token n'apparaît jamais en clair dans config.toml. Exportez la clé dans votre shell rc puis redémarrez codex.",
  "connect.agent.hermes.tagline": "Modifier ~/.hermes/config.yaml.",
  "connect.agent.hermes.blurb":
    "Hermes Agent (Nous Research). Collez le YAML ci-dessous dans ~/.hermes/config.yaml sous mcp_servers, puis lancez /reload-mcp dans une session Hermes.",

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

  // CSV · détails de la ligne
  "csv.rowDetail.title": "Détails de la ligne",
  "csv.rowDetail.open": "Ouvrir les détails de la ligne",
  "csv.rowDetail.close": "Fermer",
  "csv.rowDetail.rowOf": "Ligne {n} sur {total}",
  "csv.rowDetail.empty": "—",

  // ConnectPicker — carte de connexion sur /workspace. Mirroir de
  // huozi.app/start : Choix 1 = device flow piloté par l'agent (RFC 8628),
  // Choix 2 = CLI/GUI native par client (RFC 8252).
  "connect.picker.dropdown.label": "1. Choisissez votre Agent",
  "connect.picker.choice1.title": "Choix 1 · Laissez l'Agent s'installer",
  "connect.picker.choice1.badge":
    "RFC 8628 · pour agents cloud / headless",
  "connect.picker.choice1.desc":
    "Collez ceci dans n'importe quel agent en chat (Hermes / OpenClaw / Cowork / Claude Code, etc.). Il récupère /llms.txt depuis ce déploiement, exécute le device flow RFC 8628 lui-même — vous imprime un lien /device, vous cliquez Approve une fois, l'agent récupère la clé, écrit la config, vérifie via huozi_whoami.",
  "connect.picker.choice2.title": "Choix 2 · Installation via CLI / GUI native",
  "connect.picker.choice2.badge":
    "RFC 8252 · pour utilisateurs en terminal local",
  "connect.picker.choice2.desc":
    "Choisissez votre client et copiez une commande (ou un extrait de config). Chaque client a sa propre commande `mcp add` ou son point d'entrée GUI ; le premier appel à huozi ouvre automatiquement un navigateur pour OAuth.",
  "connect.picker.note.claude-code":
    "Collez une fois dans le terminal : inscription + déclenchement OAuth + vérification d'identité",
  "connect.picker.note.openclaw":
    "Collez une fois dans le terminal : enregistre huozi dans ~/.openclaw/openclaw.json ; le premier appel ouvre le navigateur pour OAuth",
  "connect.picker.note.hermes":
    "Collez une fois dans le terminal : --auth oauth déclenche RFC 8252 PKCE dans le navigateur (TTY et navigateur local requis)",
  "connect.picker.note.codex":
    "Ajoutez le bloc TOML à ~/.codex/config.toml, puis exécutez codex mcp login huozi pour l'OAuth navigateur (le jeton reste dans codex)",
  "connect.picker.note.cursor":
    "En un clic — Cursor l'ajoute nativement, sans rechargement ; le premier appel à huozi ouvre automatiquement le navigateur pour OAuth",
  "connect.picker.cursor.button": "Ajouter à Cursor",
  "connect.picker.note.cowork":
    "Dans Cowork : Customize → Connectors → + Add custom connector. Collez l'URL ci-dessous.",
  "connect.picker.note.generic":
    "Collez cette URL dans la config MCP de votre hôte ; l'hôte gère lui-même l'OAuth-on-first-use",
  "connect.picker.endpointLabel": "Endpoint :",
  "connect.picker.tokenSecurity":
    "Le jeton reste dans le client MCP. Il n'entre jamais dans le contexte de la conversation.",
  "connect.picker.copy": "Copier",
  "connect.picker.copied": "✓ Copié",
} as const;
