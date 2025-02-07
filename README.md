## Prérequis

Pour commencer il faut créer un dossier pour accueillir notre paquet, par exemple:

```bash
mkdir sync-toulouse
cd sync-toulouse
yarn init -y
```

Ensuite il faut y ajouter la dépendance principale `@openagenda/sync`:

```bash
yarn add @openagenda/sync
```

Puis toutes les dépendances utiles en fonction du script, par exemple:

```bash
yarn add axios he sanitize-html lodash moment-timezone
```

## Création des fichiers

La structure attendue est la suivante:
```
/
  config.js
  event.js
  index.js
  location.js
  run.js
```

### config.js

```js
"use strict";

module.exports = {
  agenda: {
    uid: 12345678
  },
  publicKey: 'dc70c13e0433737840e2b3f929dec79b',
  secretKey: '1a65e1e45defbb0911fb6f60c848453f',
  opencageKey: '0064ca2aab37b6ec21916f13a2dd1eb6',
  noBailOnInvalidImage: true,
  // downloadOnly: true,
  // simulate: true,
  // forceUpdate: true
};
```

Pendant les différentes phases de développement du script il sera possible d'utiliser les options `downloadOnly`, `simulate` et `forceUpdate` pour ne pas exécuter intégralement le script et se concentrer uniquement sur ce qui nous intéresse.

### index.js

```js
"use strict";

const log = require( '@openagenda/logs' )( 'sync-toulouse' );
const task = require( '@openagenda/sync' );
const OpenCage = require( '@openagenda/geocoder/Opencage' );
const event = require( './event' );
const location = require( './location' );
const config = require( './config' );

log.setConfig( {
  debug: {
    enable: true
  },
  token: config.insightOpsToken
} );

module.exports = async function syncTask() {
  const oaGeocoder = OpenCage( { key: config.opencageKey } );

  const stats = await task( {
    methods: {
      // list, map, getId, getUpdatedDate, postMap
      event: {
        ...event,
        map: event.map.bind(null, { oaGeocoder })
      },
      // get, map, getId, find
      location
    },
    directory: __dirname,
    log,
    ...config
  } );

  log( 'Stats: %j', stats );
};
```

C'est le fichier qui exporte la fonction de synchronisation, elle peut être appelée depuis un autre script ou depuis un CLI (run.js)

#### Paramétrages généraux

 * `directory`: la racine où sera stockée la base locale (dossier db), les fichiers temporaires (dossier data) ainsi que les fichiers d'erreurs (dossier errors)
 * `agenda`: objet contenant l'identifiant de l'agenda `{ uid }`
 * `noBailOnInvalidImage`: lorsque un lien d'image invalide est fourni sur la source, celui ci n'interromp pas la synchro de l'événement par le script. Par défaut à `false`
 * `defaultImageUrl`: fournir une image par défaut lorsqu'aucune image n'est disponible en source

### run.js

```js
"use strict";

const synchronize = require( './index' );

synchronize();
```

C'est le point d'entrée du CLI, il peut être appelé avec la commande `node run`.

Il y a la possibilité d'utiliser des arguments ou des entrées utilisteurs avec [`yargs`](https://www.npmjs.com/package/yargs) ou [`inquirer`](https://www.npmjs.com/package/inquirer) en modifiant un peu ce fichier. Pour utiliser plus rapidement les options `downloadOnly`, `simulate` ou `forceUpdate` par exemple.

### event.list (event.js)

C'est la première fonction à créer, elle a pour but de récupérer page par page tous les événements de l'API distante.

```js
"use strict";

const axios = require('axios');

const base = 'https://www.mairie-truc.fr/wp-json/wp/v2';

module.exports = async (offset = 0/*, limit = 10*/) => {
  const page = (offset / 10) + 1;
  let data;

  try {
    ({ data } = await axios.get(`${base}/evenement/?page=${page}`));
  } catch (e) {
    return [];
  }

  return data;
};
```

La fonction reçoit les arguments `offset` et `limit` et doit retourner un tableau d'événements.

### event.map (event.js)

Cette fonction reçoit les événements bruts et doit retourner un objet qui contient les propriétés tel qu'elles sont attendues par l'API d'OpenAgenda ([https://openagenda.zendesk.com/hc/fr/articles/115004460013--v2-agendas-agendaUid-events-post-Cr%C3%A9er-un-%C3%A9v%C3%A9nement](https://openagenda.zendesk.com/hc/fr/articles/115004460013--v2-agendas-agendaUid-events-post-Cr%C3%A9er-un-%C3%A9v%C3%A9nement))

L'objet contient une clé `locations` en plus pour y placer le ou les lieux de l'événements, aucun format n'est requis, le traitement du lieu se fera avec `location.get` et `location.map`:

```js
locations: [
  { id: 1234 },
  /* ... */
]
```

Si un événement ne doit pas être repris ou doit être supprimé `event.map` peut retourner `null`.

```js
map(event, formSchema, oaLocations)
```

Arguments:

* `event`: item provenant du résultat de `event.list`
* `formSchema`: le schema de l'agenda, pour définir les champs personnalisés
* `oaLocations`: les lieux actuellement définits sur l'agenda, chargés en début d'execution du script

### location.get (location.js)

`location.get` est là pour compléter un lieu provenant de `event.map` si nécessaire.

```js
get(locationId, eventLocation)
```

Arguments:

 * `locationId`: l'identifiant fourni par la méthode `location.getId`
 * `eventLocation`: item provenant de l'array `.locations` défini dans `event.map`

### location.map (location.js)

`location.map` est là pour transformer un lieu fraichement récupéré en lieu OpenAgenda ([https://openagenda.zendesk.com/hc/fr/articles/115003242794--v1-locations-post-Cr%C3%A9ation-et-mise-%C3%A0-jour-de-lieux](https://openagenda.zendesk.com/hc/fr/articles/115003242794--v1-locations-post-Cr%C3%A9ation-et-mise-%C3%A0-jour-de-lieux))

```js
map(input, eventLocation)
```

Arguments:

 * `input`: donnée fournie par `location.get`
 * `eventLocation`: donnée correspondante fournie dans un item de `.locations` généré par `event.map`

### event.getId (event.js)

Doit retourner un identifiant d'événément, il peut être partagé entre plusieurs événements qui sont en fait le même mais à différents lieux.

```js
getId(event)
```

Arguments

 * `event`: item provenant du résultat de `event.list`

### event.getUpdatedDate (event.js)

Doit retourner la dernière date de modification ou `new Date()`. Fonctionne avec un objet Date ou une chaine de caractères compatible avec moment-js

```js
getUpdatedDate(event)
```

Arguments:

 * `event`: fourni par `event.list`

### event.shouldRemove (event.js)

`event.shouldRemove` confirme ou non si un événement peut être supprimer, la fonction doit retourner `true` ou `false`;

```js
shouldRemove(event)
```

Arguments:

 * `event`: fourni par la base de données locale, c'est l'événement OpenAgenda créé ou modifié par le script

### location.getId (location.js)

Doit retourner un identifiant de lieu unique utilisé par la suite par `location.map`

```js
getId(eventLocation)
```

Arguments:
 * `eventLocation`: fourni par `event.map`, un item de `.locations`

### location.find (location.js)

Son rôle est de trouver le lieu `eventLocation` dans `oaLocations` et de le retourner ou retourner `null` pour provoquer la création d'un nouveau lieu sur l'agenda.

```js
find(oaLocations, eventLocation)
```

Arguments:

 * `OALocations`: les lieux actuellement définits sur l'agenda, chargés en début d'execution du script
 * `eventLocation`: fourni par `event.map`, un item de `.locations`

### event.postMap (event.js)

Cette fonction n'est pas obligatoire, dans le cas où elle est présente elle est appellée une fois que tous les événements sont mappés et les horaires regroupés. Les horaires sont regroupés dans le même événement lorsque qu'on a des `id`s identiques pour l'événement **et** pour le lieu.

Exemple de cas d'usage: si une source de donnée défini un horaire par événement, plusieurs événements de la source peuvent correspondre à un même événement OA qui réunit une multitude d'horaires.

Au moment de l'appel, la concatenation des horaires a déjà eu lieu. `event.postMap` peut alors servir pour qualifier certaines valeurs additionnelles en évaluant l'intégralité des horaires concaténés.

Toulouse Métropole a une notion d'"Evénement ponctuel": si un événmeent se déroule sur une période de moins de 8 jours, la valeur doit être "vraie".

```js
postMap(event, formSchema, options)
```

Arguments:

* `event`: l'événement fourni par `event.map`
* `formSchema`: le schema de l'agenda, pour définir les champs personnalisés
* `options`: un object avec `isCreate` pour une création et `isUpdate` pour une mise à jour


## Utilitaires

Accessibles soit par require sur utils, soit par require direct. Voir les tests pour des exemples d'utilisation: test/nomDeLutil.utils.test.js

 * **isURL200**: Fait l'encodage utile sur un URL présentant une ressource à télécharger, en amont de sont téléchargement.
 * **HTMLToText**: Convertit de l'HTML en texte.
 * **markdownToText**: Convertit du markdown en texte.
 * **convertToTextAndTruncate**: Convertit et tronque.