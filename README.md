# 🚸 Révise les panneaux

Petit quiz gratuit, en HTML/CSS/JS pour réviser les panneaux de signalisation du code de la route français.

**👉 Jouer en ligne :** https://kevinraphael95.github.io/yapaslepanneau/

## Modes de jeu

- **Trouve le panneau — 10 panneaux** : la signification s'affiche, il faut retrouver le bon panneau dans une grille contenant tous les panneaux du jeu. Score sur 10. Survoler une case affiche un aperçu agrandi dans la marge de l'écran.
- **Trouve le panneau — mode infini** : même principe, on enchaîne jusqu'à la première erreur (record sauvegardé).
- **Trouve le nom — 10 panneaux** : le panneau s'affiche, il faut taper sa signification (autocomplétion à partir de 3 lettres, insensible aux accents et à la casse). Score sur 10.
- **Trouve le nom — mode infini** : même principe, jusqu'à la première erreur (record sauvegardé).
- **Cours — tous les panneaux** : consultation libre de tous les panneaux avec leur signification, groupés par catégorie, filtrables et cherchables.

## Structure du projet

```
index.html        Structure de la page (tous les écrans)
style.css         Mise en page
signs.js          Base de données des panneaux (code, catégorie, signification)
script.js         Logique des modes de jeu + gestion des écrans
favicon.svg       Icône du site
```

## Données et images

- Les significations des panneaux (`signs.js`) sont sourcées sur l'annexe de l'arrêté du 24 novembre 1967 relatif à la signalisation des routes et autoroutes (version consolidée CEREMA) et les listes officielles Wikipédia (types A, AB, B, C, CE, AK, KC).
- Les illustrations sont récupérées dynamiquement depuis **Wikimedia Commons** (fichiers `File:France road sign {code}.svg`), via l'API `commons.wikimedia.org`, avec :
  - une seule requête groupée par lot de 50 panneaux (pour éviter le rate limit de l'API) ;
  - un cache dans `localStorage` valable 30 jours, pour ne pas re-télécharger la liste des URLs à chaque visite ;
  - un panneau dont l'image est introuvable est automatiquement ignoré (aucun crash, il est juste exclu du tirage).

## Ajouter ou corriger un panneau

Tout se passe dans `signs.js` : chaque entrée est un objet `{ code, cat, meaning }`.

- `code` doit correspondre exactement au nom du fichier sur Wikimedia Commons (`France road sign {code}.svg`).
- `cat` sert uniquement à choisir des mauvaises réponses cohérentes dans le QCM (`danger`, `priorite`, `interdiction`, `obligation`, `fin`, `zone`, `indication`, `service`, `temporaire`).
- `meaning` est le texte affiché comme bonne réponse — plusieurs panneaux différents peuvent partager la même signification (le jeu les traite comme équivalents).

## Sauvegardes locales

Le jeu utilise `localStorage` (aucune donnée envoyée à un serveur) pour :
- le cache des images Wikimedia (30 jours) ;
- les records de série (un par mode infini : trouve-le-panneau, trouve-le-nom) ;
- le thème clair / sombre.

Le cache d'images n'est écrit que si **tous** les lots ont été téléchargés : un échec réseau ne bloque donc plus le jeu.

## Crédits

- Illustrations des panneaux : [Wikimedia Commons](https://commons.wikimedia.org/).
- Police : [Poppins](https://fonts.google.com/specimen/Poppins) (Google Fonts).
