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
    // Inicializar Keycloak al cargar la web
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
    // Cargamos recetas
    try {
      const resRecipes = await axios.get('/recipes');
      // Verificamos que sea un array para evitar el error .map()
      setRecipes(Array.isArray(resRecipes.data) ? resRecipes.data : []);
    } catch (err) {
      console.error("Error cargando recetas:", err);
    }

    // Cargamos recomendaciones (en un bloque separado para que si falla una, la otra no pare)
    try {
      // Nota: Asegúrate de que el recommendation-service esté en el Ingress en el puerto 8000
      const resRecs = await axios.get(`/recommendations/${userId}`);
      const data = resRecs.data.recommendations || resRecs.data;
      setRecommendations(Array.isArray(data) ? data : []);
    } catch (err) {
      console.error("Error cargando recomendaciones:", err);
    }
  };

  const updatePreferences = async (newPref) => { 
    try {
      await axios.post('/users/preferences', 
        { preferences: newPref },
        { headers: { Authorization: `Bearer ${keycloak.token}` } }
      );
      
      alert(`Enviado a RabbitMQ: Gusto por "${newPref}"`);
      
      // Refrescamos después de 1.5s para dar tiempo a RabbitMQ de procesar
      setTimeout(() => fetchData(keycloak.tokenParsed.sub), 1500);
    } catch (err) {
      console.error("Error al actualizar preferencias:", err);
      alert("No se pudo conectar con el servicio de usuarios.");
    }
  };

  if (loading) return <div style={msgStyle}>Cargando sistema de seguridad...</div>;
  if (!authenticated) return <div style={msgStyle}>No autenticado. Redirigiendo...</div>;

  return (
    <div style={{ fontFamily: 'Segoe UI, Tahoma, Geneva, Verdana, sans-serif', padding: '30px', maxWidth: '1200px', margin: '0 auto', color: '#333' }}>
      
      {/* HEADER */}
      <header style={{ borderBottom: '2px solid #eee', paddingBottom: '20px', marginBottom: '20px', display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
        <h1 style={{ margin: 0, color: '#e67e22' }}>👨‍🍳 Chef Match</h1>
        <div>
          <span>Bienvenido, <strong>{username}</strong> </span>
          <button onClick={() => keycloak.logout()} style={logoutBtnStyle}>
            Cerrar Sesión
          </button>
        </div>
      </header>

      <main>
        {/* SECCIÓN DE RECOMENDACIONES (REQ2) */}
        <section style={recsSectionStyle}>
          <h3 style={{ marginTop: 0 }}>✨ Recomendaciones Personalizadas (REQ2)</h3>
          <p style={{ fontSize: '0.9rem', color: '#666' }}>Sugerencias calculadas vía RabbitMQ:</p>
          
          <ul style={{ fontSize: '1.1rem' }}>
            {recommendations.length > 0 ? (
              recommendations.map((rec, i) => <li key={i} style={{ marginBottom: '5px', color: '#2c3e50' }}>{rec}</li>)
            ) : (
              <li style={{ color: '#7f8c8d', fontWeight: 'normal' }}>Haz clic en los botones de abajo para generar recomendaciones.</li>
            )}
          </ul>

          <div style={{ marginTop: '20px' }}>
            <span style={{ marginRight: '10px', fontWeight: 'bold' }}>¿Qué te apetece hoy?</span>
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
                  <p style={{ fontSize: '0.9rem', color: '#555', marginTop: '12px', lineHeight: '1.4' }}>
                    {recipe.description}
                  </p>
                </div>
              ))
            ) : (
              <div style={{ gridColumn: '1/-1', padding: '20px', backgroundColor: '#f9f9f9', borderRadius: '8px', textAlign: 'center' }}>
                No hay recetas disponibles en este momento.
              </div>
            )}
          </div>
        </section>
      </main>
    </div>
  );
}

// Estilos en JS
const msgStyle = { textAlign: 'center', marginTop: '100px', fontSize: '1.2rem', color: '#666' };

const btnStyle = {
  marginRight: '10px',
  padding: '10px 16px',
  backgroundColor: '#fff',
  border: '2px solid #e67e22',
  color: '#e67e22',
  borderRadius: '8px',
  fontWeight: 'bold',
  cursor: 'pointer',
  transition: '0.3s'
};

const logoutBtnStyle = {
  marginLeft: '15px',
  padding: '6px 12px',
  backgroundColor: '#f8f9fa',
  border: '1px solid #ccc',
  borderRadius: '4px',
  cursor: 'pointer'
};

const recsSectionStyle = {
  backgroundColor: '#fffaf0',
  padding: '25px',
  borderRadius: '12px',
  marginBottom: '40px',
  border: '1px solid #ffeaa7',
  boxShadow: '0 4px 6px rgba(0,0,0,0.05)'
};

const cardStyle = {
  border: '1px solid #eee',
  padding: '20px',
  borderRadius: '10px',
  boxShadow: '0 4px 12px rgba(0,0,0,0.08)',
  backgroundColor: '#fff',
  display: 'flex',
  flexDirection: 'column'
};

const tagStyle = {
  backgroundColor: '#27ae60',
  color: 'white',
  padding: '3px 10px',
  borderRadius: '15px',
  fontSize: '0.7rem',
  fontWeight: 'bold',
  alignSelf: 'flex-start',
  textTransform: 'uppercase'
};

export default App;