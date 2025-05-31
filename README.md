CognitoURL:
${COGNITO_DOMAIN}/oauth2/authorize
  ?response_type=token
  &client_id=${COGNITO_APP_CLIENT_ID}
  &redirect_uri=http://localhost:3000/callback
  &scope=email+openid+profile


docker build -t iot-backend:1.0 .
docker run --rm -p 3000:3000 iot-backend:1.0
