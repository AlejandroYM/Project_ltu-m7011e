import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Keycloak from 'keycloak-js';

// Configuración de Keycloak (REQ20)
const keycloak = new Keycloak({
  url: "http://localhost:8080", 
  realm: "ChefMatchRealm",
  clientId: "chef-frontend",
});

function App() {
  const [authenticated, setAuthenticated] = useState(false);
  const [recipes, setRecipes] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [username, setUsername] = useState("");

  useEffect(() => {
    // Inicializar Keycloak al cargar la web
    keycloak.init({ onLoad: 'login-required', checkLoginIframe: false }).then(auth => {
      setAuthenticated(auth);
      if (auth) {
        setUsername(keycloak.tokenParsed.preferred_username);
        fetchData(keycloak.tokenParsed.sub);
      }
    }).catch(() => {
      console.error("Fallo en la autenticación");
    });
  }, []);

  const fetchData = async (userId) => {
    try {
      // REQ14: Consumo de APIs RESTful a través del Proxy de Vite
      const resRecipes = await axios.get('/api/recipes');
      setRecipes(resRecipes.data);

      const resRecs = await axios.get(`/api/recommendations/${userId}`);
      setRecommendations(resRecs.data.recommendations);
    } catch (err) {
      console.error("Error cargando datos de los microservicios", err);
    }
  };

  const updatePreferences = async () => {
    try {
      // REQ15: Esto dispara un evento en RabbitMQ vía user-service
      await axios.post('/api/users/preferences', 
        { preferences: 'Comida Picante' },
        { headers: { Authorization: `Bearer ${keycloak.token}` } }
      );
      
      alert("¡Preferencias enviadas! RabbitMQ está procesando el cambio...");
      
      // Refrescamos después de un breve delay para dar tiempo a RabbitMQ
      setTimeout(() => fetchData(keycloak.tokenParsed.sub), 1500);
    } catch (err) {
      alert("Error al comunicar con el user-service");
    }
  };

  if (!authenticated) return <div style={{textAlign: 'center', marginTop: '50px'}}>Cargando seguridad...</div>;

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '30px', maxWidth: '1200px', margin: '0 auto' }}>
      <header style={{ borderBottom: '2px solid #eee', paddingBottom: '20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1>👨‍🍳 Chef Match</h1>
        <div>
          <span>Hola, <strong>{username}</strong> </span>
          <button onClick={() => keycloak.logout()} style={{ marginLeft: '10