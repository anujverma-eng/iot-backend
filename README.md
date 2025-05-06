CognitoURL:
${COGNITO_DOMAIN}/oauth2/authorize
  ?response_type=token
  &client_id=${COGNITO_APP_CLIENT_ID}
  &redirect_uri=http://localhost:3000/callback
  &scope=email+openid+profile
