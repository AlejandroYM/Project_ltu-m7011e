import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Keycloak from 'keycloak-js';

// Configuración de Keycloak (REQ20)
const keycloak = new Keycloak({
  url: "https://keycloak.ltu-m7011e-5.se", 
  realm: "ChefMatchRealm",
  clientId: "frontend-client",
});

function App() {
  const [authenticated, setAuthenticated] = useState(false); 
  const [recipes, setRecipes] = useState([]);
  const [recommendations, setRecommendations] = useState([]);
  const [username, setUsername] = useState("");
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    // Inicializar Keycloak
    keycloak.init({ 
      onLoad: 'login-required', 
      checkLoginIframe: false,
      pkceMethod: 'S256',
      responseMode: 'query'
    }).then(auth => {
      setAuthenticated(auth);
      if (auth) {
        setUsername(keycloak.tokenParsed.preferred_username || "Chef");
        fetchData(keycloak.tokenParsed.sub).finally(() => setLoading(false));
      } else {
        setLoading(false);
      }
    }).catch((err) => {
      console.error("Fallo en la autenticación", err);
      setLoading(false);
    });
  }, []);

  const fetchData = async (userId) => {
    // 1. Obtener Recetas (Recipe Service)
    try {
      const resRecipes = await axios.get('/recipes');
      // Verificamos que sea un array para evitar error .map()
      setRecipes(Array.isArray(resRecipes.data) ? resRecipes.data : []);
    } catch (err) {
      console.error("Error en recetas:", err);
      setRecipes([]); 
    }

    // 2. Obtener Recomendaciones (Recommendation Service)
    try {
      const resRecs = await axios.get(`/recommendations/${userId}`);
      // Tu server de recomendaciones devuelve un objeto { userId, recommendations: [] }
      const list = resRecs.data.recommendations || [];
      setRecommendations(Array.isArray(list) ? list : []);
    } catch (err) {
      console.error("Error en recomendaciones:", err);
      setRecommendations([]);
    }
  };

  const updatePreferences = async (newPref) => { 
    try {
      // User Service a través de Ingress
      await axios.post('/users/preferences', 
        { preferences: newPref },
        { headers: { Authorization: `Bearer ${keycloak.token}` } }
      );
      
      alert(`Enviado a RabbitMQ: Preferencia "${newPref}"`);
      
      // Esperamos 1.5s para que RabbitMQ procese el mensaje antes de refrescar
      setTimeout(() => fetchData(keycloak.tokenParsed.sub), 1500);
    } catch (err) {
      console.error("Error al comunicar con user-service", err);
      alert("Error al actualizar preferencias.");
    }
  };

  if (loading) return <div style={centerStyle}>Cargando sistema de seguridad...</div>;
  if (!authenticated) return <div style={centerStyle}>No autenticado.</div>;

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '30px', maxWidth: '1200px', margin: '0 auto', color: '#333' }}>
      
      {/* HEADER */}
      <header style={{ borderBottom: '2px solid #eee', paddingBottom: '20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, color: '#d35400' }}>👨‍🍳 Chef Match</h1>
        <div>
          <span>Hola, <strong>{username}</strong> </span>
          <button onClick={() => keycloak.logout()} style={logoutBtnStyle}>Cerrar Sesión</button>
        </div>
      </header>

      <main>
        {/* SECCIÓN DE RECOMENDACIONES (REQ2) */}
        <section style={recsBoxStyle}>
          <h3 style={{ marginTop: 0 }}>✨ Recomendaciones Personalizadas (REQ2)</h3>
          <p style={{ fontSize: '0.9rem', color: '#666' }}>Se actualizan automáticamente vía RabbitMQ:</p>
          
          <ul>
            {recommendations.length > 0 ? (
              recommendations.map((rec, i) => <li key={i} style={{ marginBottom: '5px', fontWeight: 'bold' }}>{rec}</li>)
            ) : (
              <li style={{ color: '#888' }}>Haz clic en un botón de abajo para empezar a recibir sugerencias.</li>
            )}
          </ul>

          <div style={{ marginTop: '15px' }}>
            <span style={{ marginRight: '10px' }}>Simular cambio de gustos:</span>
            <button onClick={() => updatePreferences('Comida Italiana')} style={btnStyle}>Italiana 🍝</button>
            <button onClick={() => updatePreferences('Comida Vegana')} style={btnStyle}>Vegana 🥗</button>
            <button onClick={() => updatePreferences('Comida Picante')} style={btnStyle}>Picante 🌶️</button>
          </div>
        </section>

        {/* SECCIÓN DE RECETAS (REQ14) */}
        <section>
          <h3>Explorar Catálogo de Recetas</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(280px, 1fr))', gap: '20px' }}>
            {recipes.length > 0 ? (
              recipes.map(recipe => (
                <div key={recipe.id} style={cardStyle}>
                  <h4 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>{recipe.name}</h4>
                  <span style={tagStyle}>{recipe.category}</span>
                  <p style={{ fontSize: '0.85rem', color: '#555', marginTop: '10px' }}>
                    {recipe.description}
                  </p>
                </div>
              ))
            ) : (
              <p>No se encontraron recetas en el catálogo.</p>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

// Estilos
const centerStyle = { textAlign: 'center', marginTop: '50px', fontSize: '1.2rem' };
const btnStyle = { marginRight: '10px', padding: '8px 12px', backgroundColor: '#fff', border: '1px solid #d35400', color: '#d35400', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' };
const logoutBtnStyle = { marginLeft: '10px', padding: '5px 15px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #ccc' };
const recsBoxStyle = { backgroundColor: '#fff9f5', padding: '20px', borderRadius: '10px', marginBottom: '30px', border: '1px solid #ffeada' };
const cardStyle = { border: '1px solid #eee', padding: '20px', borderRadius: '8px', boxShadow: '0 4px 6px rgba(0,0,0,0.05)', backgroundColor: '#fff' };
const tagStyle = { backgroundColor: '#27ae60', color: 'white', padding: '3px 10px', borderRadius: '12px', fontSize: '0.7rem', fontWeight: 'bold', textTransform: 'uppercase' };

export default App;