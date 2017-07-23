FROM java:8

COPY target/dependency /app/dependency

ARG CACHEBUST=1
EXPOSE 4568
COPY target/backend-1.0-SNAPSHOT.jar /app/game.jar
CMD java -Xmx64m -Xms64m -XX:NewRatio=1 -XX:+PrintGCDetails -XX:+PrintGCTimeStamps -cp $(find /app/dependency/* -type f -name '*.jar' | tr "\n" ":"):/app/backend.jar more.Main
