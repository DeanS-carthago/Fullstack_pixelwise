from fastapi import FastAPI
from fastapi.security import OAuth2PasswordBearer, OAuth2PasswordRequestForm
import jwt
from jwt import PyJWTError
from datetime import datetime, timedelta, timezone
from pydantic import BaseModel
import numpy as np
from app.classifier import classify_batch
from fastapi import Header, HTTPException, Depends, Request
from slowapi import Limiter
from slowapi.util import get_remote_address
from slowapi.middleware import SlowAPIMiddleware
from app.models import Prediction, SessionLocal
import os





class ClassifyRequest(BaseModel):
	pixels: list[list[int]]

class ClassifyResponse(BaseModel):
	prediction: str
	confidence: float
	scores: dict[str, float]

# Neue response class für den Token
class TokenResponse(BaseModel):
	access_token: str
	token_type: str = "bearer"

app = FastAPI()
oauth2_scheme = OAuth2PasswordBearer(tokenUrl="token")


@app.get("/health")
def health():
	return {"status": "ok", "model_version": "v1"}

@app.get("/results")
def results():
	db = SessionLocal()
	rows = (db.query(Prediction).order_by(Prediction.created_at.desc()).limit(20).all())
	db.close()
	return {"results": [{	"id": r.id,
				"prediction": r.prediction,
				"confidence": r.confidence,
				"model_version": r.model_version,
				"created_at": r.created_at.isoformat()} 
	for r in rows]}


limiter = Limiter(key_func=get_remote_address)
app.state.limiter = limiter
app.add_middleware(SlowAPIMiddleware)

def verify_api_key(x_api_key: str = Header(...)):
	if x_api_key != os.getenv("SECRET_API_KEY"):
		raise HTTPException(status_code=401, detail="Invalid API key")

@app.post("/classify", response_model=ClassifyResponse, dependencies=[Depends(verify_api_key)])
@limiter.limit("30/minute")
def classify(request: Request, req: ClassifyRequest):
	arr = np.array(req.pixels, dtype=np.uint8)[np.newaxis]
	result = classify_batch(arr)[0]
	db = SessionLocal()
	db.add(Prediction(prediction=result["prediction"], confidence=result["confidence"], model_version="v1"))
	db.commit()
	db.close()
	return result
	


# Ab hier meine Implementation: 

JWT_SECRET_KEY = os.getenv("JWT_SECRET_KEY")
JWT_ALGORITHM = os.getenv("JWT_ALGORITHM", "HS256")
JWT_EXPIRE_MINUTES = int(os.getenv("JWT_EXPIRE_MINUTES", "15"))
JWT_USERNAME = os.getenv("JWT_USERNAME")
JWT_PASSWORD = os.getenv("JWT_PASSWORD")

def create_access_token(subject: str) -> str:
	expire = datetime.now(timezone.utc) + timedelta(minutes=JWT_EXPIRE_MINUTES)
	payload = {"sub": subject, "exp": expire}
	return jwt.encode(payload, JWT_SECRET_KEY, algorithm=JWT_ALGORITHM)

def get_current_user(token: str = Depends(oauth2_scheme)) -> str:
	try:
		payload = jwt.decode(token, JWT_SECRET_KEY, algorithms=[JWT_ALGORITHM])
		username = payload.get("sub")
		if username is None:
			raise HTTPException(status_code=401, detail="Invalid token")
		return username
	except PyJWTError:
		raise HTTPException(status_code=401, detail="Invalid token")
	

	
@app.post("/token", response_model=TokenResponse)
def login(form_data: OAuth2PasswordRequestForm = Depends()):
	if form_data.username != JWT_USERNAME or form_data.password != JWT_PASSWORD:
		raise HTTPException(status_code=401, detail="Incorrect username or password")
	access_token = create_access_token(subject=form_data.username)
	return TokenResponse(access_token=access_token)


@app.post("/classify-bearer", response_model=ClassifyResponse)
@limiter.limit("30/minute")
def classify_bearer(request: Request, req: ClassifyRequest, user: str = Depends(get_current_user)):
	arr = np.array(req.pixels, dtype=np.uint8)[np.newaxis]
	result = classify_batch(arr)[0]
	db = SessionLocal()
	db.add(Prediction(prediction=result["prediction"], confidence=result["confidence"], model_version="v1_bearer"))
	db.commit()
	db.close()
	return result
	

