package more;

import static spark.Spark.get;
import static spark.Spark.port;

import com.fasterxml.jackson.annotation.JsonCreator;
import com.fasterxml.jackson.annotation.JsonProperty;
import com.fasterxml.jackson.core.type.TypeReference;
import com.fasterxml.jackson.databind.ObjectMapper;
import java.io.File;
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

  public static class User {
    public String UUID;
    public String groupUUID;
    public String name;
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

    if (STORED_DB_FILE.exists()) {
      TypeReference<ConcurrentHashMap<String, User>> typeRef =
          new TypeReference<ConcurrentHashMap<String, User>>() {};
      db = mapper.readValue(STORED_DB_FILE, typeRef);
    }
    port(4568);
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

          User u = db.get(req.params(":uuid"));
          if (u == null) {
            throw new IllegalStateException("user not found");
          }
          Event e = new Event();
          e.stampMs = System.currentTimeMillis();
          e.value = Long.parseLong(req.params(":value"));
          u.addEvent(e);

          changed.getAndIncrement();
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
