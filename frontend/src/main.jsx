import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Keycloak from 'keycloak-js';
import './index.css'
import App from './App.jsx'

// Configuración de Keycloak según tu README y Propuesta
const keycloak = new Keycloak({
  url: 'https://keycloak.ltu-m7011e-5.se', // URL de tu servidor Keycloak
  realm: 'ChefMatchRealm',       // Tu Realm definido
  clientId: 'frontend-client',   // El ID del cliente que creaste en Keycloak
});

const root = createRoot(document.getElementById('root'));

keycloak.init({ 
  onLoad: 'login-required', 
  checkLoginIframe: false 
}).then((authenticated) => {
  if (authenticated) {
    console.log("Usuario autenticado con éxito");
    root.render(
      <StrictMode>
        {/* Pasamos keycloak como prop para usar el token en las llamadas API */}
        <App keycloak={keycloak} />
      </StrictMode>,
    );
  } else {
    window.location.reload();
  }
}).catch((err) => {
  console.error("Error al inicializar Keycloak:", err);
  root.render(<div>Error de conexión con el servicio de identidad.</div>);
});