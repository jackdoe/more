package more;

import static spark.Spark.before;
import static spark.Spark.get;
import static spark.Spark.port;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import com.notnoop.apns.APNS;
import com.notnoop.apns.ApnsService;
import java.io.BufferedReader;
import java.io.File;
import java.io.InputStreamReader;
import java.io.OutputStreamWriter;
import java.net.HttpURLConnection;
import java.net.URL;
import java.util.ArrayList;
import java.util.List;
import java.util.Map;
import java.util.UUID;
import java.util.concurrent.ConcurrentHashMap;
import java.util.concurrent.CopyOnWriteArrayList;
import java.util.concurrent.Executors;
import java.util.concurrent.ScheduledExecutorService;
import java.util.concurrent.TimeUnit;
import java.util.concurrent.atomic.AtomicInteger;
import more.Main.User.Event;

public class Main {
  private static ObjectMapper mapper = new ObjectMapper();
  private static Map<String, User> db = new ConcurrentHashMap<>();

  public static class FCMNotification {

    public static final String AUTH_KEY_FCM = System.getenv("KEY_FCM");
    public static final String API_URL_FCM = "https://fcm.googleapis.com/fcm/send";

    public static class Request {
      public static class Data {
        public String message;
      }

      public String to;
      public Data data;

      public Request(String to, String message) {
        this.to = to;
        this.data = new Data();
        this.data.message = message;
      }
    }

    public static void pushFCMNotification(String DeviceIdKey, String title) throws Exception {

      String authKey = AUTH_KEY_FCM;
      String FMCurl = API_URL_FCM;

      URL url = new URL(FMCurl);
      HttpURLConnection conn = (HttpURLConnection) url.openConnection();

      conn.setUseCaches(false);
      conn.setDoInput(true);
      conn.setDoOutput(true);

      conn.setRequestMethod("POST");
      conn.setRequestProperty("Authorization", "key=" + authKey);
      conn.setRequestProperty("Content-Type", "application/json");
      conn.connect();
      Request req = new Request(DeviceIdKey, title);
      OutputStreamWriter wr = new OutputStreamWriter(conn.getOutputStream());
      String s = mapper.writeValueAsString(req);
      wr.write(s);
      wr.flush();
      wr.close();

      BufferedReader in = new BufferedReader(new InputStreamReader(conn.getInputStream()));
      String inputLine;
      StringBuffer response = new StringBuffer();

      while ((inputLine = in.readLine()) != null) {
        response.append(inputLine);
      }
      System.out.println(response);
      in.close();
      conn.disconnect();
    }
  }

  public enum Platform {
    Android,
    iOS;
  }

  public static class User {
    public String UUID;
    public String groupUUID;
    public String name;
    public String deviceId;
    public Platform platform;
    public List<Event> events;

    @JsonCreator
    public void fromJson(
        @JsonProperty String UUID,
        @JsonProperty String groupUUID,
        @JsonProperty String name,
        @JsonProperty List<Event> events) {
      this.UUID = UUID;
      this.groupUUID = groupUUID;
      this.name = name;
      this.events = new CopyOnWriteArrayList<>();
      this.events.addAll(events);
    }

    public User() {}

    public User(String name) {
      this.UUID = java.util.UUID.randomUUID().toString();
      this.groupUUID = java.util.UUID.randomUUID().toString();
      this.name = name;
      this.events = new CopyOnWriteArrayList<>();
    }

    public static class Event {
      public long value;
      public long stampMs;
    }

    @Override
    public int hashCode() {
      return this.UUID.hashCode();
    }

    @Override
    public boolean equals(Object o) {
      if (!(o instanceof User)) return false;

      return ((User) o).UUID.equals(this.UUID);
    }

    public void addEvent(Event e) {
      events.add(e);
    }
  }

  public static final File STORED_DB_FILE = new File("/tmp/db.json");

  public static void store() {
    System.out.println("storing");
    try {
      mapper.writeValue(STORED_DB_FILE, db);
    } catch (Exception e) {
      e.printStackTrace();
    }
  }

  private static final ScheduledExecutorService scheduler = Executors.newScheduledThreadPool(1);

  public static void main(String[] args) throws Exception {
    AtomicInteger changed = new AtomicInteger(0);
    Runtime.getRuntime()
        .addShutdownHook(
            new Thread() {
              public void run() {
                store();
              }
            });

    scheduler.scheduleAtFixedRate(
        new Runnable() {
          @Override
          public void run() {
            int v = changed.get();
            if (v > 0) {
              store();
              changed.decrementAndGet();
            }
          }
        },
        1,
        1,
        TimeUnit.SECONDS);

    ApnsService apns =
        APNS.newService()
            .withCert("/private/cert.p12", System.getenv("CERT_PASSWORD"))
            .withSandboxDestination()
            .build();

    if (STORED_DB_FILE.exists()) {
      TypeReference<ConcurrentHashMap<String, User>> typeRef =
          new TypeReference<ConcurrentHashMap<String, User>>() {};
      db = mapper.readValue(STORED_DB_FILE, typeRef);
    }
    port(4568);
    before(
        (req, res) -> {
          System.out.println(req.pathInfo());
        });

    get(
        "/makeUser/:uuid",
        (req, res) -> {
          res.status(200);
          res.type("application/json");
          User u = db.get(req.params(":uuid"));
          if (u == null) {
            u = new User(null);
            db.put(u.UUID, u);
          }

          changed.getAndIncrement();
          return mapper.writeValueAsString(u);
        });

    get(
        "/changeName/:uuid/:name",
        (req, res) -> {
          res.status(200);
          res.type("application/json");

          User u = db.get(req.params(":uuid"));
          if (u == null) {
            throw new IllegalStateException("user not found");
          }

          u.name = req.params(":name");

          changed.getAndIncrement();
          return mapper.writeValueAsString(u);
        });

    get(
        "/changeGroup/:uuid/:groupUUID",
        (req, res) -> {
          res.status(200);
          res.type("application/json");

          User u = db.get(req.params(":uuid"));
          if (u == null) {
            throw new IllegalStateException("user not found");
          }
          UUID gid;
          try {
            gid = UUID.fromString(req.params(":groupUUID"));
          } catch (Exception e) {
            gid = UUID.randomUUID();
          }

          u.groupUUID = gid.toString();

          changed.getAndIncrement();
          return mapper.writeValueAsString(u);
        });

    get(
        "/addEvent/:uuid/:value",
        (req, res) -> {
          res.status(200);
          res.type("application/json");

          User whoami = db.get(req.params(":uuid"));
          if (whoami == null) {
            throw new IllegalStateException("user not found");
          }
          Event e = new Event();
          e.stampMs = System.currentTimeMillis();
          e.value = Long.parseLong(req.params(":value"));
          whoami.addEvent(e);
          changed.getAndIncrement();

          db.forEach(
              (k, user) -> {
                if (user.groupUUID.equals(whoami.groupUUID)) {
                  try {
                    if (user.deviceId != null && !whoami.UUID.equals(user.UUID)) {
                      String title =
                          String.format(
                              "%s %s%d", whoami.name, e.value > 0 ? "+" : "-", Math.abs(e.value));
                      System.out.println(
                          "to: "
                              + user.deviceId
                              + "("
                              + user.platform
                              + ")"
                              + " message: "
                              + title);
                      if (user.platform == Platform.iOS) {
                        apns.push(user.deviceId, APNS.newPayload().alertBody(title).build());
                      } else {
                        FCMNotification.pushFCMNotification(user.deviceId, title);
                      }
                    }
                  } catch (Exception se) {
                    se.printStackTrace();
                  }
                }
              });

          return "{\"success\":true}";
        });

    get(
        "/setDeviceIdAndroid/:uuid/:token",
        (req, res) -> {
          res.status(200);

          User u = db.get(req.params(":uuid"));
          if (u != null) {
            u.platform = Platform.Android;
            u.deviceId = req.params(":token");
          }

          return "{\"success\":true}";
        });
    get(
        "/setDeviceIdiOS/:uuid/:token",
        (req, res) -> {
          res.status(200);

          User u = db.get(req.params(":uuid"));
          if (u != null) {
            u.platform = Platform.iOS;
            u.deviceId = req.params(":token");
          }

          return "{\"success\":true}";
        });
    get(
        "/get/:uuid",
        (req, res) -> {
          res.status(200);
          res.type("application/json");

          List<User> grouped = new ArrayList<>();

          User u = db.get(req.params(":uuid"));
          if (u == null) {
            throw new IllegalStateException("user not found");
          }
          db.forEach(
              (k, user) -> {
                if (user.groupUUID.equals(u.groupUUID)) {
                  grouped.add(user);
                }
              });

          return mapper.writeValueAsString(grouped);
        });
  }
}
