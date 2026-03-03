GDPR Compliance and Privacy

1. Data Minimization
On our recipe platform, we apply the principle of data minimization by requesting only the information strictly necessary for the system's operation (User Service and Recommendation Service).

Data collected: Email address, encrypted password, and dietary/culinary preferences.

Data excluded: We do not request real name, date of birth, phone number, or geographic location, as this information does not add value to recipe recommendations and would increase privacy risks.


2. User Rights
The User Service exposes specific endpoints to guarantee the GDPR rights of students and amateur cooks:

Right to be forgotten: A DELETE endpoint, that permanently deletes the user's profile, preferences, and anonymizes their previous recipes and ratings to maintain the integrity of the community's recipes.


3. Privacy by Design

User passwords are never stored in plain text

The Recommendation Service processes user IDs instead of email addresses to generate recommendations, reducing the exposure of personal data between microservices.