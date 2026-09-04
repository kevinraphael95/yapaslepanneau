"use strict";

/*
 * Base de panneaux du code de la route français.
 * Chaque "code" correspond exactement au fichier Wikimedia Commons
 * "File:France road sign {code}.svg" (vérifié pour plusieurs entrées,
 * ex. A1a, C24a, C111...).
 * Sources : Wikipédia FR (listes officielles par type A / AB / B / C / CE),
 * routes.fandom.com (Liste des signaux routiers français).
 *
 * cat: "danger" | "priorite" | "interdiction" | "obligation" | "indication" | "service"
 * Le champ "cat" est utilisé par pickDistractors() dans script.js pour
 * proposer des mauvaises réponses cohérentes (même famille de panneau).
 */

const SIGNS = [
  // ---------- A — Panneaux de danger ----------
  { code: "A1a", cat: "danger", meaning: "Virage à droite" },
  { code: "A1b", cat: "danger", meaning: "Virage à gauche" },
  { code: "A1c", cat: "danger", meaning: "Succession de virages dont le premier est à droite" },
  { code: "A1d", cat: "danger", meaning: "Succession de virages dont le premier est à gauche" },
  { code: "A2a", cat: "danger", meaning: "Cassis ou dos-d'âne" },
  { code: "A2b", cat: "danger", meaning: "Ralentisseur de type dos-d'âne" },
  { code: "A3", cat: "danger", meaning: "Chaussée rétrécie" },
  { code: "A3a", cat: "danger", meaning: "Chaussée rétrécie par la droite" },
  { code: "A3b", cat: "danger", meaning: "Chaussée rétrécie par la gauche" },
  { code: "A4", cat: "danger", meaning: "Chaussée particulièrement glissante" },
  { code: "A6", cat: "danger", meaning: "Pont mobile" },
  { code: "A7", cat: "danger", meaning: "Passage à niveau muni de barrières" },
  { code: "A8", cat: "danger", meaning: "Passage à niveau sans barrières" },
  { code: "A9a", cat: "danger", meaning: "Traversée de voie de véhicules de transport en commun" },
  { code: "A9b", cat: "danger", meaning: "Traversée de voies de tramways" },
  { code: "A13a", cat: "danger", meaning: "Endroit fréquenté par les enfants" },
  { code: "A13b", cat: "danger", meaning: "Passage pour piétons" },
  { code: "A14", cat: "danger", meaning: "Autres dangers" },
  { code: "A15a1", cat: "danger", meaning: "Passage d'animaux domestiques" },
  { code: "A15b", cat: "danger", meaning: "Passage d'animaux sauvages" },
  { code: "A15c", cat: "danger", meaning: "Passage de cavaliers" },
  { code: "A16", cat: "danger", meaning: "Descente dangereuse" },
  { code: "A17", cat: "danger", meaning: "Annonce de feux tricolores" },
  { code: "A18", cat: "danger", meaning: "Circulation dans les deux sens" },
  { code: "A19", cat: "danger", meaning: "Risque de chute de pierres" },
  { code: "A20", cat: "danger", meaning: "Débouché sur un quai ou une berge" },
  { code: "A21", cat: "danger", meaning: "Débouché de cyclistes" },
  { code: "A23", cat: "danger", meaning: "Traversée d'une aire de danger aérien" },

  // ---------- AB — Intersections et priorité ----------
  { code: "AB1", cat: "priorite", meaning: "Priorité à droite" },
  { code: "AB2", cat: "priorite", meaning: "Priorité ponctuelle à la prochaine intersection" },
  { code: "AB3a", cat: "priorite", meaning: "Cédez le passage" },
  { code: "AB3b", cat: "priorite", meaning: "Signal avancé de cédez-le-passage" },
  { code: "AB4", cat: "priorite", meaning: "Stop" },
  { code: "AB5", cat: "priorite", meaning: "Signal avancé de stop" },
  { code: "AB6", cat: "priorite", meaning: "Route à caractère prioritaire" },
  { code: "AB7", cat: "priorite", meaning: "Fin de route à caractère prioritaire" },
  { code: "AB25", cat: "priorite", meaning: "Annonce d'un giratoire avec priorité aux usagers de l'anneau" },

  // ---------- B — Panneaux d'interdiction ----------
  { code: "B0", cat: "interdiction", meaning: "Circulation interdite à tout véhicule dans les deux sens" },
  { code: "B1", cat: "interdiction", meaning: "Sens interdit à tout véhicule" },
  { code: "B2a", cat: "interdiction", meaning: "Interdiction de tourner à gauche à la prochaine intersection" },
  { code: "B2b", cat: "interdiction", meaning: "Interdiction de tourner à droite à la prochaine intersection" },
  { code: "B2c", cat: "interdiction", meaning: "Interdiction de faire demi-tour" },
  { code: "B3", cat: "interdiction", meaning: "Interdiction de dépasser tous les véhicules à moteur (sauf deux-roues)" },
  { code: "B3a", cat: "interdiction", meaning: "Interdiction de dépasser pour les véhicules de plus de 3,5 tonnes" },
  { code: "B4", cat: "interdiction", meaning: "Arrêt au poste de douane" },
  { code: "B5a", cat: "interdiction", meaning: "Arrêt au poste de gendarmerie" },
  { code: "B5b", cat: "interdiction", meaning: "Arrêt au poste de police" },
  { code: "B5c", cat: "interdiction", meaning: "Arrêt au poste de péage" },
  { code: "B6a1", cat: "interdiction", meaning: "Stationnement interdit" },
  { code: "B6d", cat: "interdiction", meaning: "Arrêt et stationnement interdits" },
  { code: "B7a", cat: "interdiction", meaning: "Accès interdit aux véhicules à moteur, sauf cyclomoteurs" },
  { code: "B7b", cat: "interdiction", meaning: "Accès interdit à tous les véhicules à moteur" },
  { code: "B8", cat: "interdiction", meaning: "Accès interdit aux véhicules affectés au transport de marchandises" },
  { code: "B9a", cat: "interdiction", meaning: "Accès interdit aux piétons" },
  { code: "B10a", cat: "interdiction", meaning: "Accès interdit aux véhicules dont la longueur dépasse le nombre indiqué" },
  { code: "B13a", cat: "interdiction", meaning: "Accès interdit aux véhicules dont le poids par essieu dépasse le nombre indiqué" },
  { code: "B14", cat: "interdiction", meaning: "Limitation de vitesse" },
  { code: "B15", cat: "interdiction", meaning: "Cédez le passage à la circulation venant en sens inverse" },
  { code: "B16", cat: "interdiction", meaning: "Signaux sonores interdits" },
  { code: "B17", cat: "interdiction", meaning: "Interdiction de circuler sans maintenir un intervalle minimal entre véhicules" },
  { code: "B18a", cat: "interdiction", meaning: "Accès interdit aux véhicules transportant des marchandises explosives ou inflammables" },
  { code: "B18c", cat: "interdiction", meaning: "Accès interdit aux véhicules transportant des matières dangereuses" },

  // ---------- B — Panneaux d'obligation ----------
  { code: "B21-1", cat: "obligation", meaning: "Obligation de tourner à droite avant le panneau" },
  { code: "B21-2", cat: "obligation", meaning: "Obligation de tourner à gauche avant le panneau" },
  { code: "B21a1", cat: "obligation", meaning: "Contournement obligatoire par la droite" },
  { code: "B21a2", cat: "obligation", meaning: "Contournement obligatoire par la gauche" },
  { code: "B21b", cat: "obligation", meaning: "Direction obligatoire à la prochaine intersection : tout droit" },
  { code: "B21c1", cat: "obligation", meaning: "Direction obligatoire à la prochaine intersection : à droite" },
  { code: "B21c2", cat: "obligation", meaning: "Direction obligatoire à la prochaine intersection : à gauche" },
  { code: "B21d1", cat: "obligation", meaning: "Directions obligatoires : tout droit ou à droite" },
  { code: "B21d2", cat: "obligation", meaning: "Directions obligatoires : tout droit ou à gauche" },
  { code: "B21e", cat: "obligation", meaning: "Directions obligatoires : à droite ou à gauche" },
  { code: "B22a", cat: "obligation", meaning: "Piste ou bande obligatoire pour les cycles" },
  { code: "B22b", cat: "obligation", meaning: "Chemin obligatoire réservé aux piétons" },
  { code: "B22c", cat: "obligation", meaning: "Chemin obligatoire réservé aux cavaliers" },
  { code: "B25", cat: "obligation", meaning: "Vitesse minimale obligatoire" },
  { code: "B26", cat: "obligation", meaning: "Chaînes à neige obligatoires sur au moins deux roues motrices" },
  { code: "B27a", cat: "obligation", meaning: "Voie réservée aux véhicules de transport en commun" },
  { code: "B27b", cat: "obligation", meaning: "Voie réservée aux tramways" },

  // ---------- C — Panneaux d'indication ----------
  { code: "C1a", cat: "indication", meaning: "Lieu aménagé pour le stationnement" },
  { code: "C1c", cat: "indication", meaning: "Lieu aménagé pour le stationnement payant" },
  { code: "C3", cat: "indication", meaning: "Risque d'incendie" },
  { code: "C5", cat: "indication", meaning: "Station de taxis" },
  { code: "C6", cat: "indication", meaning: "Arrêt d'autobus" },
  { code: "C12", cat: "indication", meaning: "Circulation à sens unique" },
  { code: "C13a", cat: "indication", meaning: "Impasse" },
  { code: "C18", cat: "indication", meaning: "Priorité par rapport à la circulation venant en sens inverse" },
  { code: "C20a", cat: "indication", meaning: "Passage pour piétons" },
  { code: "C24b", cat: "indication", meaning: "Voies affectées selon la direction à suivre" },
  { code: "C26a", cat: "indication", meaning: "Voie de détresse à droite" },

  // ---------- CE — Panneaux de service ----------
  { code: "CE1", cat: "service", meaning: "Poste de secours" },
  { code: "CE2a", cat: "service", meaning: "Poste d'appel d'urgence" },
  { code: "CE2b", cat: "service", meaning: "Cabine téléphonique publique" },
  { code: "CE4a", cat: "service", meaning: "Terrain de camping pour tentes" },
  { code: "CE4b", cat: "service", meaning: "Terrain de camping pour caravanes et autocaravanes" },
  { code: "CE5a", cat: "service", meaning: "Auberge de jeunesse" },
  { code: "CE5b", cat: "service", meaning: "Chambre d'hôtes ou gîte" },
  { code: "CE7", cat: "service", meaning: "Emplacement pour pique-nique" },
  { code: "CE8", cat: "service", meaning: "Gare auto/train" },
  { code: "CE10", cat: "service", meaning: "Embarcadère" },
  { code: "CE12", cat: "service", meaning: "Toilettes ouvertes au public" },
  { code: "CE14", cat: "service", meaning: "Installations accessibles aux personnes à mobilité réduite" },
  { code: "CE15a", cat: "service", meaning: "Poste de distribution de carburant ouvert 24h/24, 7j/7" },
  { code: "CE16", cat: "service", meaning: "Restaurant" },
  { code: "CE17", cat: "service", meaning: "Hôtel ou motel" },
  { code: "CE18", cat: "service", meaning: "Débit de boissons ou collations" },
];
