import { StrictMode } from 'react'
import { createRoot } from 'react-dom/client'
import Keycloak from 'keycloak-js';
import './index.css'
import App from './App.jsx'


const keycloak = new Keycloak({
  url: 'https://keycloak.ltu-m7011e-5.se', 
  realm: 'ChefMatchRealm',       
  clientId: 'frontend-client',   
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
        {/* Give keycloak as prop to use the token in the APIS */}
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