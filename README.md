# 🚰 Grupo Molina — Historial de Pozos

Plataforma web para registrar y consultar el historial de mantenimiento de pozos.

---

## ✅ PASO 1 — Subir a GitHub Pages

1. Ve a [github.com](https://github.com) e inicia sesión.
2. Haz clic en **New repository** (botón verde).
3. Nombre del repositorio: `pozos-molina` (o el que prefieras).
4. Márcalo como **Public**.
5. Haz clic en **Create repository**.
6. En la página del repositorio vacío, haz clic en **uploading an existing file**.
7. Sube los 4 archivos: `index.html`, `style.css`, `app.js`, `README.md`.
8. Haz clic en **Commit changes**.
9. Ve a **Settings → Pages**.
10. En "Branch" selecciona `main`, carpeta `/ (root)` y haz clic en **Save**.
11. En unos minutos tu app estará en: `https://TU_USUARIO.github.io/pozos-molina`

---

## ✅ PASO 2 — Crear proyecto en Firebase (gratis)

1. Ve a [console.firebase.google.com](https://console.firebase.google.com).
2. Haz clic en **Agregar proyecto**.
3. Nombre: `pozos-molina` → Continuar.
4. Puedes desactivar Google Analytics → Continuar.
5. Espera a que se cree el proyecto y haz clic en **Continuar**.

---

## ✅ PASO 3 — Configurar Firestore (base de datos)

1. En el menú izquierdo de Firebase, haz clic en **Firestore Database**.
2. Haz clic en **Crear base de datos**.
3. Selecciona **Comenzar en modo de producción** → Siguiente.
4. Elige la región `us-central1` → Habilitar.
5. Ve a la pestaña **Reglas** y reemplaza el contenido con:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{document=**} {
      allow read, write: if true;
    }
  }
}
```

6. Haz clic en **Publicar**.

> ⚠️ Estas reglas permiten acceso completo. La seguridad la maneja el login de la app.
> Para mayor seguridad en el futuro puedes agregar autenticación de Firebase.

---

## ✅ PASO 4 — Configurar Storage (para fotos)

1. En el menú izquierdo, haz clic en **Storage**.
2. Haz clic en **Comenzar**.
3. Acepta las reglas predeterminadas → Siguiente → Listo.
4. Ve a la pestaña **Reglas** y reemplaza con:

```
rules_version = '2';
service firebase.storage {
  match /b/{bucket}/o {
    match /{allPaths=**} {
      allow read, write: if true;
    }
  }
}
```

5. Haz clic en **Publicar**.

---

## ✅ PASO 5 — Obtener las credenciales de Firebase

1. En Firebase, haz clic en el ícono ⚙️ (engrane) → **Configuración del proyecto**.
2. Baja hasta la sección **Tus aplicaciones**.
3. Haz clic en el ícono **</>** (Web).
4. Nombre de la app: `pozos-molina` → Registrar app.
5. Copia el bloque `firebaseConfig` que aparece. Tiene este formato:

```javascript
const firebaseConfig = {
  apiKey: "AIzaSy...",
  authDomain: "pozos-molina.firebaseapp.com",
  projectId: "pozos-molina",
  storageBucket: "pozos-molina.appspot.com",
  messagingSenderId: "123456789",
  appId: "1:123456789:web:abc123"
};
```

---

## ✅ PASO 6 — Pegar credenciales en app.js

1. Abre el archivo `app.js`.
2. Busca al inicio del archivo la sección `FIREBASE_CONFIG`.
3. Reemplaza los valores `"TU_..."` con los valores reales que copiaste.

**Ejemplo — antes:**
```javascript
const FIREBASE_CONFIG = {
  apiKey:            "TU_API_KEY",
  authDomain:        "TU_PROJECT.firebaseapp.com",
  ...
};
```

**Ejemplo — después:**
```javascript
const FIREBASE_CONFIG = {
  apiKey:            "AIzaSy...",
  authDomain:        "pozos-molina.firebaseapp.com",
  projectId:         "pozos-molina",
  storageBucket:     "pozos-molina.appspot.com",
  messagingSenderId: "123456789",
  appId:             "1:123456789:web:abc123"
};
```

4. Guarda el archivo y vuelve a subirlo a GitHub (reemplaza el anterior).

---

## ✅ PASO 7 — Cambiar usuarios y contraseñas

Al inicio de `app.js` también puedes cambiar los usuarios:

```javascript
const DEFAULT_USERS = {
  admin: {
    password: "TU_CLAVE_ADMIN",   // ← cambia esto
    role:     "admin",
    nombre:   "Administrador"
  },
  campo: {
    password: "TU_CLAVE_CAMPO",   // ← cambia esto
    role:     "operador",
    nombre:   "Operador de campo"
  },
  consulta: {
    password: "TU_CLAVE_VISTA",   // ← cambia esto
    role:     "visor",
    nombre:   "Consulta"
  }
};
```

Una vez que hayas iniciado sesión como **admin**, también puedes cambiar las claves
desde la propia plataforma en **Gestionar usuarios**.

---

## 👥 Roles de usuario

| Rol | Ver pozos | Ver historial | Agregar trabajos | Editar datos técnicos | Eliminar | Gestionar usuarios | Importar consumos |
|---|---|---|---|---|---|---|---|
| **Admin** | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ | ✅ |
| **Operador** | ✅ | ✅ | ✅ | ❌ | ❌ | ❌ | ✅ |
| **Visor** | ✅ | ✅ | ❌ | ❌ | ❌ | ❌ | ❌ |

---

## 📊 Módulo de Consumos de agua

Además del historial de mantenimiento, la plataforma incluye una segunda pestaña **"Consumos"** para llevar el control mensual de extracción de agua por campo agrícola.

**Cómo funciona:**
1. Ve a la pestaña **Consumos** en el panel izquierdo
2. Clic en **"+ Importar corte (PDF)"**
3. Sube el PDF del corte mensual (mismo formato: Campo Agrícola → pozo → dotación → lecturas → SUMA)
4. La plataforma extrae automáticamente los datos y los muestra en una vista previa editable
5. Puedes corregir cualquier dato antes de guardar (clic en el ícono ✎ de cada fila)
6. Al guardar, se crean automáticamente los campos agrícolas nuevos y quedan disponibles para análisis

**Qué incluye el análisis:**
- Resumen general con KPIs del último corte (consumido, dotación, % usado, pozos reportados)
- Gráfica histórica de consumo por campo a través de los meses
- Detalle por pozo de cada campo, con histórico de cortes
- Indicador visual de % de dotación usado (verde / amarillo / rojo según el nivel)

Cada corte se identifica por su fecha, así que si vuelves a importar el mismo mes, se actualiza en vez de duplicarse.


## 📁 Archivos del proyecto

```
pozos-molina/
├── index.html   — Estructura de la app
├── style.css    — Estilos visuales
├── app.js       — Lógica y conexión a Firebase
└── README.md    — Este archivo
```

---

## ❓ Soporte

Si tienes dudas sobre algún paso, comparte el mensaje de error exacto
y se puede resolver rápidamente.
