# EduGasy Pro — infrastructure as code pour Specific.
#
# L'application est une SPA React (Vite) entièrement côté client : les données
# sont stockées dans le localStorage du navigateur. Il n'y a donc ni backend ni
# base de données, et ce fichier reste volontairement minimal. Si l'application
# évolue plus tard vers un backend, une base Postgres ou du stockage objet, il
# suffira d'ajouter les blocs correspondants ici.

# Compilation TypeScript + build de production Vite (script "build" de package.json).
build "spa" {
  base    = "node"
  command = "npm run build"
}

# Service web qui sert le dossier dist/ généré par le build.
service "web" {
  build   = build.spa
  command = "npx vite preview --host 0.0.0.0 --port $PORT"

  endpoint {
    public = true

    # Un site statique renvoie toujours 2xx sur "/" : cela suffit comme sonde.
    health_check {
      path = "/"
    }
  }

  env = {
    PORT = port
  }

  # En développement, on lance le serveur Vite avec rechargement à chaud
  # sur le port attribué par Specific.
  dev {
    command = "npm run dev -- --host 0.0.0.0 --port $PORT"
  }
}
