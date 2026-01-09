import React, { useEffect, useState } from 'react';
import axios from 'axios';
import Keycloak from 'keycloak-js';

// Configuración de Keycloak (Asegúrate de que coincida con main.jsx)
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
    try {
      // 1. Obtener Recetas (Ruta relativa -> Ingress -> Recipe Service:8000)
      const resRecipes = await axios.get('/recipes');
      setRecipes(resRecipes.data);

      // 2. Obtener Recomendaciones (Ruta relativa -> Ingress -> Recommendation Service:8000)
      const resRecs = await axios.get(`/recommendations/${userId}`, {
        headers: { Authorization: `Bearer ${keycloak.token}` }
      });
      setRecommendations(resRecs.data);
    } catch (err) {
      console.error("Error cargando datos:", err);
    }
  };

  const updatePreferences = async (newPref) => {
    try {
      // Usamos /users/preferences. El Ingress lo manda al User Service:8000
      await axios.post('/users/preferences', 
        { 
          userId: keycloak.tokenParsed.sub,
          category: newPref  // Cambiado de 'preferences' a 'category' para el backend
        }, 
        {
          headers: { 
            Authorization: `Bearer ${keycloak.token}`,
            'Content-Type': 'application/json'
          }
        }
      );
      alert(`Preferencia "${newPref}" enviada con éxito.`);
      // Refrescamos recomendaciones tras un pequeño delay para que RabbitMQ procese
      setTimeout(() => fetchData(keycloak.tokenParsed.sub), 1500);
    } catch (err) {
      console.error("Error al comunicar con user-service:", err);
      alert("Error al actualizar preferencias. Revisa la consola.");
    }
  };

  if (loading) return <div style={centerStyle}>Cargando ChefMatch...</div>;
  if (!authenticated) return <div style={centerStyle}>Redirigiendo al login...</div>;

  return (
    <div style={{ fontFamily: 'Arial, sans-serif', padding: '20px', backgroundColor: '#fdfdfd' }}>
      <header style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', borderBottom: '2px solid #eee', paddingBottom: '10px' }}>
        <h1 style={{ color: '#d35400' }}>👨‍🍳 ChefMatch</h1>
        <div>
          <span>Bienvenido, <strong>{username}</strong></span>
          <button onClick={() => keycloak.logout()} style={logoutBtnStyle}>Cerrar Sesión</button>
        </div>
      </header>

      <main style={{ marginTop: '30px' }}>
        <section>
          <h3>¿Qué te apetece hoy?</h3>
          <p>Selecciona una categoría para actualizar tus recomendaciones:</p>
          <button onClick={() => updatePreferences('Italiana')} style={btnStyle}>Italiana 🍝</button>
          <button onClick={() => updatePreferences('Mexicana')} style={btnStyle}>Mexicana 🌮</button>
          <button onClick={() => updatePreferences('Vegana')} style={btnStyle}>Vegana 🥗</button>
        </section>

        <section style={{ marginTop: '40px' }}>
          <h3>✨ Tus Recomendaciones Personalizadas</h3>
          <div style={recsBoxStyle}>
            {recommendations.length > 0 ? (
              <ul>
                {recommendations.map((rec, index) => <li key={index}>{rec}</li>)}
              </ul>
            ) : (
              <p>Selecciona una categoría arriba para obtener recomendaciones.</p>
            )}
          </div>
        </section>

        <section style={{ marginTop: '40px' }}>
          <h3>📖 Catálogo Global de Recetas</h3>
          <div style={{ display: 'grid', gridTemplateColumns: 'repeat(auto-fill, minmax(250px, 1fr))', gap: '20px' }}>
            {recipes.map(recipe => (
              <div key={recipe.id} style={cardStyle}>
                <h4 style={{ margin: '0 0 10px 0', color: '#2c3e50' }}>{recipe.name}</h4>
                <span style={tagStyle}>{recipe.category}</span>
                <p style={{ fontSize: '0.85rem', color: '#555', marginTop: '10px' }}>{recipe.description}</p>
              </div>
            ))}
          </div>
        </section>
      </main>
    </div>
  );
}

// Estilos rápidos
const centerStyle = { textAlign: 'center', marginTop: '50px', fontSize: '1.2rem' };
const btnStyle = { marginRight: '10px', padding: '10px 15px', backgroundColor: '#fff', border: '1px solid #d35400', color: '#d35400', borderRadius: '5px', cursor: 'pointer', fontWeight: 'bold' };
const logoutBtnStyle = { marginLeft: '10px', padding: '5px 15px', cursor: 'pointer', borderRadius: '4px', border: '1px solid #ccc' };
const recsBoxStyle = { backgroundColor: '#fff9f5', padding: '20px', borderRadius: '10px', marginBottom: '30px', border: '1px solid #ffeada' };
const cardStyle = { border: '1px solid #eee', padding: '20px', borderRadius: '10px', backgroundColor: '#fff', boxShadow: '0 2px 5px rgba(0,0,0,0.05)' };
const tagStyle = { backgroundColor: '#e67e22', color: '#fff', padding: '3px 8px', borderRadius: '12px', fontSize: '0.75rem', fontWeight: 'bold' };

export default App;