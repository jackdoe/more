java -Xmx64m -Xms64m -cp $(find target/dependency/* -type f -name '*.jar' | tr "\n" ":"):target/backend-1.0-SNAPSHOT.jar more.Main
